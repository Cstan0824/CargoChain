// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Narrow DeliveryEscrow surface needed by agreement-change workflows.
interface IDeliveryEscrowLifecycle {
    enum RequestStatus {
        Open,
        PendingApproval,
        Funded,
        InProgress,
        Completed,
        Cancelled,
        Expired,
        Refunded
    }

    enum MilestoneStatus {
        Proposed,
        PendingProof,
        Submitted,
        Verified,
        Rejected,
        Paid
    }

    struct ExistingMilestoneFunding {
        uint256 milestoneId;
        uint256 amount;
    }

    struct NewMilestoneFunding {
        string name;
        uint256 insertBeforeMilestoneId;
        uint256 amount;
    }

    function getLifecycleSnapshot(uint256 requestId)
        external
        view
        returns (
            address shipper,
            address carrier,
            RequestStatus status,
            uint256 deadline,
            uint256 milestoneStateVersion
        );

    function hasPendingMilestoneProof(uint256 requestId) external view returns (bool);

    function finalizeMutualCancellation(uint256 requestId) external;

    function finalizeAmendment(
        uint256 requestId,
        uint256 newDeadline,
        ExistingMilestoneFunding[] calldata existingFunding,
        NewMilestoneFunding[] calldata newMilestones,
        uint256 additionalOperationalAllowance
    ) external payable;

    function minimumProofAllowance() external view returns (uint256);

    function getMilestoneCount(uint256 requestId) external view returns (uint256);

    function getMilestoneExecutionIndex(uint256 requestId, uint256 milestoneId)
        external
        view
        returns (uint256);

    function getMilestoneStatus(uint256 requestId, uint256 milestoneId)
        external
        view
        returns (MilestoneStatus);
}

/// @title CargoChain accepted-shipment lifecycle manager
/// @notice Owns amendment and mutual-cancellation negotiation state while
/// DeliveryEscrow remains the source of truth for requests, milestones, and ETH.
contract LifecycleManager {
    using SafeERC20 for IERC20;
    /// @notice Sentinel used by amendment proposals to place a new checkpoint last.
    uint256 public constant APPEND_MILESTONE_ID = type(uint256).max;

    enum NegotiationKind {
        None,
        Amendment,
        Cancellation
    }

    enum CancellationStatus {
        Pending,
        Accepted,
        Rejected,
        Withdrawn,
        Expired
    }

    enum AmendmentStatus {
        Pending,
        Accepted,
        Rejected,
        Withdrawn,
        Expired
    }

    enum AmendmentGasPolicy {
        EachPaysOwn,
        RequesterCoversResponse
    }

    struct ExistingMilestoneFunding {
        uint256 milestoneId;
        uint256 amount;
    }

    struct NewMilestoneFunding {
        string name;
        uint256 insertBeforeMilestoneId;
        uint256 amount;
    }

    /// @notice Shared lock used by amendments and mutual cancellations.
    /// `milestoneStateVersion` snapshots delivery progress when the workflow
    /// opens so an amendment cannot be accepted against stale milestone data.
    struct ActiveNegotiation {
        NegotiationKind kind;
        uint256 negotiationId;
        uint256 milestoneStateVersion;
    }

    struct CancellationRequest {
        address requester;
        address responder;
        string requesterNote;
        string rejectionNote;
        uint256 responseDeadline;
        CancellationStatus status;
        uint256 createdAt;
        uint256 resolvedAt;
    }

    struct AmendmentRequest {
        address requester;
        address responder;
        string requesterNote;
        string rejectionNote;
        uint256 previousDeadline;
        uint256 proposedDeadline;
        uint256 additionalFunding;
        uint256 operationalAllowance;
        uint256 responseDeadline;
        AmendmentStatus status;
        uint256 createdAt;
        uint256 resolvedAt;
        bool directExtension;
        AmendmentGasPolicy gasPolicy;
        uint256 responseAllowance;
        uint256 responseAllowanceSpent;
        address responseAllowanceFunder;
        bool responseReimbursed;
    }

    address public immutable initializer;
    IERC20 public immutable cargoToken;
    IDeliveryEscrowLifecycle public deliveryEscrow;
    uint256 public constant MIN_ADDITIONAL_FUNDING = 0.01 ether;
    uint256 public constant MIN_CANCELLATION_LEAD_TIME = 1 hours;
    uint256 public constant MIN_AMENDMENT_LEAD_TIME = 1 hours;
    uint256 public constant MIN_DEADLINE_CHANGE = 15 minutes;
    uint256 public constant MAX_NOTE_BYTES = 500;
    uint256 public constant MAX_TOTAL_MILESTONES = 20;
    uint256 public constant AMENDMENT_RESPONSE_GAS_UNIT_CAP = 180_000;
    uint256 public constant AMENDMENT_RESPONSE_OVERHEAD = 40_000;
    uint256 public constant AMENDMENT_MIN_GAS_PRICE = 2 gwei;
    uint256 public constant AMENDMENT_PRIORITY_FEE_BUFFER = 1 gwei;
    uint256 public constant AMENDMENT_MAX_RESPONSE_REIMBURSEMENT = 5 ether;

    mapping(uint256 => ActiveNegotiation) private activeNegotiations;
    mapping(uint256 => CancellationRequest[]) private cancellationRequests;
    mapping(uint256 => AmendmentRequest[]) private amendmentRequests;
    mapping(uint256 => mapping(uint256 => ExistingMilestoneFunding[]))
        private amendmentExistingFunding;
    mapping(uint256 => mapping(uint256 => NewMilestoneFunding[]))
        private amendmentNewMilestones;

    event DeliveryEscrowInitialized(address indexed deliveryEscrow);
    event CancellationRequested(
        uint256 indexed requestId,
        uint256 indexed cancellationId,
        address indexed requester,
        address responder,
        uint256 responseDeadline
    );
    event CancellationAccepted(
        uint256 indexed requestId,
        uint256 indexed cancellationId,
        address indexed responder
    );
    event CancellationRejected(
        uint256 indexed requestId,
        uint256 indexed cancellationId,
        address indexed responder
    );
    event CancellationWithdrawn(
        uint256 indexed requestId,
        uint256 indexed cancellationId,
        address indexed requester
    );
    event CancellationExpired(uint256 indexed requestId, uint256 indexed cancellationId);
    event ShipmentDeadlineExtended(
        uint256 indexed requestId,
        address indexed shipper,
        uint256 previousDeadline,
        uint256 newDeadline,
        string note
    );
    event AmendmentRequested(
        uint256 indexed requestId,
        uint256 indexed amendmentId,
        address indexed requester,
        address responder,
        uint256 proposedDeadline,
        uint256 additionalFunding,
        uint256 responseDeadline
    );
    event AmendmentAccepted(
        uint256 indexed requestId,
        uint256 indexed amendmentId,
        address indexed responder
    );
    event AmendmentRejected(
        uint256 indexed requestId,
        uint256 indexed amendmentId,
        address indexed responder
    );
    event AmendmentWithdrawn(
        uint256 indexed requestId,
        uint256 indexed amendmentId,
        address indexed requester
    );
    event AmendmentExpired(uint256 indexed requestId, uint256 indexed amendmentId);
    event AmendmentResponseAllowanceFunded(uint256 indexed requestId, uint256 indexed amendmentId, address indexed funder, uint256 amount);
    event AmendmentResponseReimbursed(uint256 indexed requestId, uint256 indexed amendmentId, address indexed responder, uint256 amount);
    event AmendmentResponseAllowanceRefunded(uint256 indexed requestId, uint256 indexed amendmentId, address indexed funder, uint256 amount);
    event AmendmentOperationalAllowanceFunded(uint256 indexed requestId, uint256 indexed amendmentId, uint256 amount);

    constructor(address cargoTokenAddress) {
        require(cargoTokenAddress != address(0), "cargo token required");
        initializer = msg.sender;
        cargoToken = IERC20(cargoTokenAddress);
    }

    function initializeDeliveryEscrow(address deliveryEscrowAddress) external {
        require(msg.sender == initializer, "caller is not initializer");
        require(deliveryEscrowAddress != address(0), "escrow address required");
        require(address(deliveryEscrow) == address(0), "escrow already initialized");
        deliveryEscrow = IDeliveryEscrowLifecycle(deliveryEscrowAddress);
        emit DeliveryEscrowInitialized(deliveryEscrowAddress);
    }

    modifier requestExists(uint256 requestId) {
        require(address(deliveryEscrow) != address(0), "escrow is not initialized");
        // DeliveryEscrow performs the canonical request-ID validation.
        deliveryEscrow.getLifecycleSnapshot(requestId);
        _;
    }

    /// @notice Returns the shared agreement-change lock for a request.
    /// A `None` kind means there is no pending amendment or cancellation.
    function getActiveNegotiation(uint256 requestId)
        external
        view
        requestExists(requestId)
        returns (
            NegotiationKind kind,
            uint256 negotiationId,
            uint256 milestoneStateVersion
        )
    {
        ActiveNegotiation storage negotiation = activeNegotiations[requestId];
        return (
            negotiation.kind,
            negotiation.negotiationId,
            negotiation.milestoneStateVersion
        );
    }

    function hasPendingNegotiation(uint256 requestId)
        public
        view
        requestExists(requestId)
        returns (bool)
    {
        return activeNegotiations[requestId].kind != NegotiationKind.None;
    }

    /// @notice Lets the shipper grant more time without making the carrier
    /// approve a change that can only benefit the carrier.
    function extendShipmentDeadline(
        uint256 requestId,
        uint256 newDeadline,
        string calldata note
    ) external requestExists(requestId) {
        _requireNegotiableShipment(requestId);
        (address shipper, , , uint256 currentDeadline, ) = deliveryEscrow
            .getLifecycleSnapshot(requestId);
        require(msg.sender == shipper, "caller is not shipper");
        require(
            activeNegotiations[requestId].kind == NegotiationKind.None,
            "another negotiation is pending"
        );
        require(
            newDeadline >= currentDeadline + MIN_DEADLINE_CHANGE,
            "deadline extension below minimum"
        );
        require(bytes(note).length <= MAX_NOTE_BYTES, "note exceeds 500 bytes");

        IDeliveryEscrowLifecycle.ExistingMilestoneFunding[] memory existingFunding =
            new IDeliveryEscrowLifecycle.ExistingMilestoneFunding[](0);
        IDeliveryEscrowLifecycle.NewMilestoneFunding[] memory newMilestones =
            new IDeliveryEscrowLifecycle.NewMilestoneFunding[](0);
        deliveryEscrow.finalizeAmendment(
            requestId,
            newDeadline,
            existingFunding,
            newMilestones,
            0
        );
        amendmentRequests[requestId].push(
            AmendmentRequest({
                requester: msg.sender,
                responder: address(0),
                requesterNote: note,
                rejectionNote: "",
                previousDeadline: currentDeadline,
                proposedDeadline: newDeadline,
                additionalFunding: 0,
                operationalAllowance: 0,
                responseDeadline: block.timestamp,
                status: AmendmentStatus.Accepted,
                createdAt: block.timestamp,
                resolvedAt: block.timestamp,
                directExtension: true,
                gasPolicy: AmendmentGasPolicy.EachPaysOwn,
                responseAllowance: 0,
                responseAllowanceSpent: 0,
                responseAllowanceFunder: address(0),
                responseReimbursed: false
            })
        );
        emit ShipmentDeadlineExtended(
            requestId,
            msg.sender,
            currentDeadline,
            newDeadline,
            note
        );
    }

    function requestAmendment(
        uint256 requestId,
        uint256 proposedDeadline,
        uint256 responseDeadline,
        string calldata requesterNote,
        ExistingMilestoneFunding[] calldata existingFunding,
        NewMilestoneFunding[] calldata newMilestones
    ) external requestExists(requestId) returns (uint256 amendmentId) {
        return _requestAmendment(
            requestId,
            proposedDeadline,
            responseDeadline,
            requesterNote,
            existingFunding,
            newMilestones,
            AmendmentGasPolicy.EachPaysOwn,
            0
        );
    }

    /// @notice Submit an amendment with an explicit response reimbursement policy.
    function requestAmendmentWithGasPolicy(
        uint256 requestId,
        uint256 proposedDeadline,
        uint256 responseDeadline,
        string calldata requesterNote,
        ExistingMilestoneFunding[] calldata existingFunding,
        NewMilestoneFunding[] calldata newMilestones,
        AmendmentGasPolicy gasPolicy,
        uint256 responseAllowance
    ) external requestExists(requestId) returns (uint256 amendmentId) {
        require(gasPolicy <= AmendmentGasPolicy.RequesterCoversResponse, "invalid gas policy");
        return _requestAmendment(
            requestId,
            proposedDeadline,
            responseDeadline,
            requesterNote,
            existingFunding,
            newMilestones,
            gasPolicy,
            responseAllowance
        );
    }

    function _requestAmendment(
        uint256 requestId,
        uint256 proposedDeadline,
        uint256 responseDeadline,
        string calldata requesterNote,
        ExistingMilestoneFunding[] calldata existingFunding,
        NewMilestoneFunding[] calldata newMilestones,
        AmendmentGasPolicy gasPolicy,
        uint256 responseAllowance
    ) internal returns (uint256 amendmentId) {
        _requireNegotiableShipment(requestId);
        _requireNegotiationParticipant(requestId, msg.sender);
        _requireValidResponseDeadline(requestId, responseDeadline);
        require(bytes(requesterNote).length > 0, "amendment note required");
        require(bytes(requesterNote).length <= MAX_NOTE_BYTES, "note exceeds 500 bytes");
        require(proposedDeadline > block.timestamp, "deadline must be future");

        (address shipper, address carrier, , uint256 currentDeadline, ) = deliveryEscrow
            .getLifecycleSnapshot(requestId);
        require(
            currentDeadline > block.timestamp + MIN_AMENDMENT_LEAD_TIME,
            "shipment deadline is within one hour"
        );
        if (proposedDeadline != currentDeadline) {
            uint256 deadlineDifference = proposedDeadline > currentDeadline
                ? proposedDeadline - currentDeadline
                : currentDeadline - proposedDeadline;
            require(
                deadlineDifference >= MIN_DEADLINE_CHANGE,
                "deadline change below minimum"
            );
        }
        require(
            msg.sender == shipper || proposedDeadline >= currentDeadline,
            "carrier cannot shorten deadline"
        );

        uint256 additionalFunding = _validateAmendmentAllocations(
            requestId,
            existingFunding,
            newMilestones
        );
        uint256 operationalAllowance = newMilestones.length * deliveryEscrow.minimumProofAllowance();
        require(
            proposedDeadline != currentDeadline || additionalFunding > 0,
            "amendment must change agreement"
        );
        if (additionalFunding > 0) {
            require(
                additionalFunding >= MIN_ADDITIONAL_FUNDING,
                "additional funding below minimum"
            );
        }
        if (proposedDeadline < currentDeadline) {
            require(
                additionalFunding >= MIN_ADDITIONAL_FUNDING,
                "shorter deadline requires additional funding"
            );
            require(
                responseDeadline <= proposedDeadline,
                "response deadline exceeds proposed deadline"
            );
        }
        require(
            !(msg.sender == shipper &&
                proposedDeadline > currentDeadline &&
                additionalFunding == 0 &&
                operationalAllowance == 0),
            "shipper can extend deadline directly"
        );
        if (msg.sender == shipper) {
            if (additionalFunding + operationalAllowance > 0) {
                require(
                    cargoToken.allowance(msg.sender, address(this)) >= additionalFunding + operationalAllowance,
                    "CARGO allowance too low"
                );
                cargoToken.safeTransferFrom(msg.sender, address(this), additionalFunding + operationalAllowance);
            }
        } else {
            // Carrier-requested funding is supplied by the shipper when the
            // counterparty accepts the amendment.
        }

        if (gasPolicy == AmendmentGasPolicy.RequesterCoversResponse) {
            require(
                responseAllowance >= minimumResponseAllowance(),
                "response allowance below minimum"
            );
            require(cargoToken.allowance(msg.sender, address(this)) >= responseAllowance, "CARGO allowance too low");
            cargoToken.safeTransferFrom(msg.sender, address(this), responseAllowance);
        } else {
            require(responseAllowance == 0, "response allowance requires reimbursement policy");
        }

        address responder = msg.sender == shipper ? carrier : shipper;
        amendmentId = amendmentRequests[requestId].length;
        amendmentRequests[requestId].push(
            AmendmentRequest({
                requester: msg.sender,
                responder: responder,
                requesterNote: requesterNote,
                rejectionNote: "",
                previousDeadline: currentDeadline,
                proposedDeadline: proposedDeadline,
                additionalFunding: additionalFunding,
                operationalAllowance: operationalAllowance,
                responseDeadline: responseDeadline,
                status: AmendmentStatus.Pending,
                createdAt: block.timestamp,
                resolvedAt: 0,
                directExtension: false,
                gasPolicy: gasPolicy,
                responseAllowance: responseAllowance,
                responseAllowanceSpent: 0,
                responseAllowanceFunder: gasPolicy == AmendmentGasPolicy.RequesterCoversResponse
                    ? msg.sender
                    : address(0),
                responseReimbursed: false
            })
        );
        for (uint256 i = 0; i < existingFunding.length; i++) {
            amendmentExistingFunding[requestId][amendmentId].push(existingFunding[i]);
        }
        for (uint256 i = 0; i < newMilestones.length; i++) {
            amendmentNewMilestones[requestId][amendmentId].push(newMilestones[i]);
        }

        _openNegotiation(requestId, NegotiationKind.Amendment, amendmentId);
        emit AmendmentRequested(
            requestId,
            amendmentId,
            msg.sender,
            responder,
            proposedDeadline,
            additionalFunding,
            responseDeadline
        );
        if (responseAllowance > 0) {
            emit AmendmentResponseAllowanceFunded(requestId, amendmentId, msg.sender, responseAllowance);
        }
        if (operationalAllowance > 0) {
            emit AmendmentOperationalAllowanceFunded(requestId, amendmentId, operationalAllowance);
        }
    }

    function acceptAmendment(uint256 requestId, uint256 amendmentId)
        external
        requestExists(requestId)
    {
        uint256 gasAtStart = gasleft();
        AmendmentRequest storage amendment = _pendingAmendment(requestId, amendmentId);
        require(msg.sender == amendment.responder, "caller is not amendment responder");
        require(block.timestamp <= amendment.responseDeadline, "response deadline has passed");
        _requireNegotiableShipment(requestId);
        _requireCurrentMilestoneState(requestId, NegotiationKind.Amendment, amendmentId);

        (address shipper, , , , ) = deliveryEscrow.getLifecycleSnapshot(requestId);
        if (amendment.requester != shipper && amendment.additionalFunding + amendment.operationalAllowance > 0) {
            require(
                cargoToken.allowance(msg.sender, address(this)) >= amendment.additionalFunding + amendment.operationalAllowance,
                "CARGO allowance too low"
            );
            cargoToken.safeTransferFrom(msg.sender, address(this), amendment.additionalFunding + amendment.operationalAllowance);
        }

        IDeliveryEscrowLifecycle.ExistingMilestoneFunding[] memory existingFunding =
            _copyExistingFunding(requestId, amendmentId);
        IDeliveryEscrowLifecycle.NewMilestoneFunding[] memory newMilestones =
            _copyNewMilestones(requestId, amendmentId);
        uint256 amendmentFunding = amendment.additionalFunding;
        uint256 amendmentOperationalAllowance = amendment.operationalAllowance;
        uint256 proposedDeadline = amendment.proposedDeadline;

        amendment.status = AmendmentStatus.Accepted;
        amendment.resolvedAt = block.timestamp;
        _closeNegotiation(requestId, NegotiationKind.Amendment, amendmentId);
        if (amendmentFunding + amendmentOperationalAllowance > 0) {
            cargoToken.safeTransfer(address(deliveryEscrow), amendmentFunding + amendmentOperationalAllowance);
        }
        deliveryEscrow.finalizeAmendment(
            requestId,
            proposedDeadline,
            existingFunding,
            newMilestones,
            amendmentOperationalAllowance
        );
        _reimburseAmendmentResponse(requestId, amendmentId, gasAtStart);
        _refundStagedAmendment(requestId, amendmentId);
        emit AmendmentAccepted(requestId, amendmentId, msg.sender);
    }

    function rejectAmendment(
        uint256 requestId,
        uint256 amendmentId,
        string calldata rejectionNote
    ) external requestExists(requestId) {
        uint256 gasAtStart = gasleft();
        AmendmentRequest storage amendment = _pendingAmendment(requestId, amendmentId);
        require(msg.sender == amendment.responder, "caller is not amendment responder");
        require(block.timestamp <= amendment.responseDeadline, "response deadline has passed");
        require(bytes(rejectionNote).length <= MAX_NOTE_BYTES, "note exceeds 500 bytes");

        amendment.status = AmendmentStatus.Rejected;
        amendment.rejectionNote = rejectionNote;
        amendment.resolvedAt = block.timestamp;
        _closeNegotiation(requestId, NegotiationKind.Amendment, amendmentId);
        _reimburseAmendmentResponse(requestId, amendmentId, gasAtStart);
        _refundStagedAmendment(requestId, amendmentId);
        emit AmendmentRejected(requestId, amendmentId, msg.sender);
    }

    function withdrawAmendment(uint256 requestId, uint256 amendmentId)
        external
        requestExists(requestId)
    {
        AmendmentRequest storage amendment = _pendingAmendment(requestId, amendmentId);
        require(msg.sender == amendment.requester, "caller is not amendment requester");

        amendment.status = AmendmentStatus.Withdrawn;
        amendment.resolvedAt = block.timestamp;
        _closeNegotiation(requestId, NegotiationKind.Amendment, amendmentId);
        _refundStagedAmendment(requestId, amendmentId);
        emit AmendmentWithdrawn(requestId, amendmentId, msg.sender);
    }

    function expireAmendment(uint256 requestId, uint256 amendmentId)
        external
        requestExists(requestId)
    {
        AmendmentRequest storage amendment = _pendingAmendment(requestId, amendmentId);
        require(block.timestamp > amendment.responseDeadline, "response deadline is active");

        amendment.status = AmendmentStatus.Expired;
        amendment.resolvedAt = block.timestamp;
        _closeNegotiation(requestId, NegotiationKind.Amendment, amendmentId);
        _refundStagedAmendment(requestId, amendmentId);
        emit AmendmentExpired(requestId, amendmentId);
    }

    function getAmendmentCount(uint256 requestId)
        external
        view
        requestExists(requestId)
        returns (uint256)
    {
        return amendmentRequests[requestId].length;
    }

    function getAmendmentRequests(uint256 requestId)
        external
        view
        requestExists(requestId)
        returns (AmendmentRequest[] memory)
    {
        return amendmentRequests[requestId];
    }

    function getAmendmentExistingFunding(uint256 requestId, uint256 amendmentId)
        external
        view
        requestExists(requestId)
        returns (ExistingMilestoneFunding[] memory)
    {
        require(amendmentId < amendmentRequests[requestId].length, "amendment does not exist");
        return amendmentExistingFunding[requestId][amendmentId];
    }

    function getAmendmentNewMilestones(uint256 requestId, uint256 amendmentId)
        external
        view
        requestExists(requestId)
        returns (NewMilestoneFunding[] memory)
    {
        require(amendmentId < amendmentRequests[requestId].length, "amendment does not exist");
        return amendmentNewMilestones[requestId][amendmentId];
    }

    function requestCancellation(
        uint256 requestId,
        string calldata requesterNote,
        uint256 responseDeadline
    ) external requestExists(requestId) returns (uint256 cancellationId) {
        _requireNegotiableShipment(requestId);
        _requireNegotiationParticipant(requestId, msg.sender);
        (address shipper, address carrier, , uint256 shipmentDeadline, ) = deliveryEscrow
            .getLifecycleSnapshot(requestId);
        require(
            shipmentDeadline > block.timestamp + MIN_CANCELLATION_LEAD_TIME,
            "shipment deadline is within one hour"
        );
        _requireValidResponseDeadline(requestId, responseDeadline);
        require(bytes(requesterNote).length > 0, "cancellation note required");
        require(bytes(requesterNote).length <= MAX_NOTE_BYTES, "note exceeds 500 bytes");

        address responder = msg.sender == shipper ? carrier : shipper;
        cancellationId = cancellationRequests[requestId].length;
        cancellationRequests[requestId].push(
            CancellationRequest({
                requester: msg.sender,
                responder: responder,
                requesterNote: requesterNote,
                rejectionNote: "",
                responseDeadline: responseDeadline,
                status: CancellationStatus.Pending,
                createdAt: block.timestamp,
                resolvedAt: 0
            })
        );
        _openNegotiation(requestId, NegotiationKind.Cancellation, cancellationId);
        emit CancellationRequested(
            requestId,
            cancellationId,
            msg.sender,
            responder,
            responseDeadline
        );
    }

    function acceptCancellation(uint256 requestId, uint256 cancellationId)
        external
        requestExists(requestId)
    {
        CancellationRequest storage cancellation = _pendingCancellation(
            requestId,
            cancellationId
        );
        require(msg.sender == cancellation.responder, "caller is not cancellation responder");
        require(block.timestamp <= cancellation.responseDeadline, "response deadline has passed");
        _requireNegotiableShipment(requestId);
        _requireNoPendingMilestoneProof(requestId);

        cancellation.status = CancellationStatus.Accepted;
        cancellation.resolvedAt = block.timestamp;
        _closeNegotiation(requestId, NegotiationKind.Cancellation, cancellationId);
        deliveryEscrow.finalizeMutualCancellation(requestId);
        emit CancellationAccepted(requestId, cancellationId, msg.sender);
    }

    function rejectCancellation(
        uint256 requestId,
        uint256 cancellationId,
        string calldata rejectionNote
    ) external requestExists(requestId) {
        CancellationRequest storage cancellation = _pendingCancellation(
            requestId,
            cancellationId
        );
        require(msg.sender == cancellation.responder, "caller is not cancellation responder");
        require(block.timestamp <= cancellation.responseDeadline, "response deadline has passed");
        require(bytes(rejectionNote).length <= MAX_NOTE_BYTES, "note exceeds 500 bytes");

        cancellation.status = CancellationStatus.Rejected;
        cancellation.rejectionNote = rejectionNote;
        cancellation.resolvedAt = block.timestamp;
        _closeNegotiation(requestId, NegotiationKind.Cancellation, cancellationId);
        emit CancellationRejected(requestId, cancellationId, msg.sender);
    }

    function withdrawCancellation(uint256 requestId, uint256 cancellationId)
        external
        requestExists(requestId)
    {
        CancellationRequest storage cancellation = _pendingCancellation(
            requestId,
            cancellationId
        );
        require(msg.sender == cancellation.requester, "caller is not cancellation requester");

        cancellation.status = CancellationStatus.Withdrawn;
        cancellation.resolvedAt = block.timestamp;
        _closeNegotiation(requestId, NegotiationKind.Cancellation, cancellationId);
        emit CancellationWithdrawn(requestId, cancellationId, msg.sender);
    }

    function expireCancellation(uint256 requestId, uint256 cancellationId)
        external
        requestExists(requestId)
    {
        CancellationRequest storage cancellation = _pendingCancellation(
            requestId,
            cancellationId
        );
        require(block.timestamp > cancellation.responseDeadline, "response deadline is active");

        cancellation.status = CancellationStatus.Expired;
        cancellation.resolvedAt = block.timestamp;
        _closeNegotiation(requestId, NegotiationKind.Cancellation, cancellationId);
        emit CancellationExpired(requestId, cancellationId);
    }

    function getCancellationCount(uint256 requestId)
        external
        view
        requestExists(requestId)
        returns (uint256)
    {
        return cancellationRequests[requestId].length;
    }

    function getCancellationRequests(uint256 requestId)
        external
        view
        requestExists(requestId)
        returns (CancellationRequest[] memory)
    {
        return cancellationRequests[requestId];
    }

    function referenceGasPrice() public view returns (uint256) {
        uint256 candidate = block.basefee + AMENDMENT_PRIORITY_FEE_BUFFER;
        return candidate > AMENDMENT_MIN_GAS_PRICE ? candidate : AMENDMENT_MIN_GAS_PRICE;
    }

    function minimumResponseAllowance() public view returns (uint256) {
        return (AMENDMENT_RESPONSE_GAS_UNIT_CAP + AMENDMENT_RESPONSE_OVERHEAD)
            * referenceGasPrice()
            * 10_000;
    }

    function _reimburseAmendmentResponse(
        uint256 requestId,
        uint256 amendmentId,
        uint256 gasAtStart
    ) private {
        AmendmentRequest storage amendment = amendmentRequests[requestId][amendmentId];
        if (
            amendment.gasPolicy != AmendmentGasPolicy.RequesterCoversResponse
            || amendment.responseReimbursed
            || amendment.responseAllowance == 0
        ) return;

        amendment.responseReimbursed = true;
        uint256 measuredGas = gasAtStart - gasleft() + AMENDMENT_RESPONSE_OVERHEAD;
        if (measuredGas > AMENDMENT_RESPONSE_GAS_UNIT_CAP) {
            measuredGas = AMENDMENT_RESPONSE_GAS_UNIT_CAP;
        }
        uint256 calculated = measuredGas * (
            tx.gasprice < referenceGasPrice() ? tx.gasprice : referenceGasPrice()
        ) * 10_000;
        if (calculated > AMENDMENT_MAX_RESPONSE_REIMBURSEMENT) {
            calculated = AMENDMENT_MAX_RESPONSE_REIMBURSEMENT;
        }
        uint256 remaining = amendment.responseAllowance - amendment.responseAllowanceSpent;
        if (calculated > remaining) calculated = remaining;
        if (calculated == 0) return;

        amendment.responseAllowanceSpent += calculated;
        cargoToken.safeTransfer(amendment.responder, calculated);
        emit AmendmentResponseReimbursed(requestId, amendmentId, amendment.responder, calculated);
    }

    function _requireNegotiableShipment(uint256 requestId) internal view {
        (, , IDeliveryEscrowLifecycle.RequestStatus status, uint256 deadline, ) = deliveryEscrow
            .getLifecycleSnapshot(requestId);
        require(
            status == IDeliveryEscrowLifecycle.RequestStatus.Funded ||
                status == IDeliveryEscrowLifecycle.RequestStatus.InProgress,
            "request is not active"
        );
        require(block.timestamp <= deadline, "request deadline has passed");
    }

    function _requireNegotiationParticipant(uint256 requestId, address participant)
        internal
        view
    {
        (address shipper, address carrier, , , ) = deliveryEscrow.getLifecycleSnapshot(
            requestId
        );
        require(
            participant == shipper || participant == carrier,
            "caller is not shipment participant"
        );
    }

    function _requireNegotiationCounterparty(uint256 requestId, address requester)
        internal
        view
    {
        (address shipper, address carrier, , , ) = deliveryEscrow.getLifecycleSnapshot(
            requestId
        );
        require(
            requester == shipper || requester == carrier,
            "requester is not shipment participant"
        );
        address counterparty = requester == shipper ? carrier : shipper;
        require(msg.sender == counterparty, "caller is not negotiation counterparty");
    }

    function _requireValidResponseDeadline(uint256 requestId, uint256 responseDeadline)
        internal
        view
    {
        (, , , uint256 deadline, ) = deliveryEscrow.getLifecycleSnapshot(requestId);
        require(responseDeadline > block.timestamp, "response deadline must be future");
        require(
            responseDeadline <= deadline,
            "response deadline exceeds shipment deadline"
        );
    }

    function _openNegotiation(
        uint256 requestId,
        NegotiationKind kind,
        uint256 negotiationId
    ) internal {
        require(kind != NegotiationKind.None, "negotiation kind required");
        require(
            activeNegotiations[requestId].kind == NegotiationKind.None,
            "another negotiation is pending"
        );
        (, , , , uint256 milestoneStateVersion) = deliveryEscrow.getLifecycleSnapshot(
            requestId
        );
        activeNegotiations[requestId] = ActiveNegotiation({
            kind: kind,
            negotiationId: negotiationId,
            milestoneStateVersion: milestoneStateVersion
        });
    }

    function _requireCurrentMilestoneState(
        uint256 requestId,
        NegotiationKind kind,
        uint256 negotiationId
    ) internal view {
        ActiveNegotiation storage negotiation = activeNegotiations[requestId];
        require(
            negotiation.kind == kind && negotiation.negotiationId == negotiationId,
            "negotiation is not active"
        );
        (, , , , uint256 milestoneStateVersion) = deliveryEscrow.getLifecycleSnapshot(
            requestId
        );
        require(
            negotiation.milestoneStateVersion == milestoneStateVersion,
            "milestone state changed"
        );
    }

    function _closeNegotiation(
        uint256 requestId,
        NegotiationKind kind,
        uint256 negotiationId
    ) internal {
        ActiveNegotiation storage negotiation = activeNegotiations[requestId];
        require(
            negotiation.kind == kind && negotiation.negotiationId == negotiationId,
            "negotiation is not active"
        );
        delete activeNegotiations[requestId];
    }

    function _requireNoPendingMilestoneProof(uint256 requestId) internal view {
        require(
            !deliveryEscrow.hasPendingMilestoneProof(requestId),
            "milestone proof is awaiting verification"
        );
    }

    function _validateAmendmentAllocations(
        uint256 requestId,
        ExistingMilestoneFunding[] calldata existingFunding,
        NewMilestoneFunding[] calldata newMilestones
    ) private view returns (uint256 totalFunding) {
        for (uint256 i = 0; i < existingFunding.length; i++) {
            ExistingMilestoneFunding calldata allocation = existingFunding[i];
            require(allocation.amount > 0, "allocation must be positive");
            for (uint256 previous = 0; previous < i; previous++) {
                require(
                    existingFunding[previous].milestoneId != allocation.milestoneId,
                    "existing milestones must be unique"
                );
            }
            require(
                deliveryEscrow.getMilestoneStatus(requestId, allocation.milestoneId) !=
                    IDeliveryEscrowLifecycle.MilestoneStatus.Paid,
                "paid milestone cannot be funded"
            );
            totalFunding += allocation.amount;
        }

        uint256 previousInsertionPosition;
        bool hasPreviousInsertion;
        uint256 milestoneCount = deliveryEscrow.getMilestoneCount(requestId);
        require(
            milestoneCount + newMilestones.length <= MAX_TOTAL_MILESTONES,
            "too many milestones"
        );
        for (uint256 i = 0; i < newMilestones.length; i++) {
            NewMilestoneFunding calldata addition = newMilestones[i];
            require(bytes(addition.name).length > 0, "milestone name required");
            require(addition.amount > 0, "allocation must be positive");
            uint256 insertionPosition = milestoneCount;
            if (addition.insertBeforeMilestoneId != APPEND_MILESTONE_ID) {
                IDeliveryEscrowLifecycle.MilestoneStatus targetStatus = deliveryEscrow
                    .getMilestoneStatus(requestId, addition.insertBeforeMilestoneId);
                require(
                    targetStatus == IDeliveryEscrowLifecycle.MilestoneStatus.PendingProof ||
                        targetStatus == IDeliveryEscrowLifecycle.MilestoneStatus.Rejected,
                    "new milestone must precede eligible milestone"
                );
                insertionPosition = deliveryEscrow.getMilestoneExecutionIndex(
                    requestId,
                    addition.insertBeforeMilestoneId
                );
            }
            require(
                !hasPreviousInsertion || insertionPosition >= previousInsertionPosition,
                "new milestones must be ordered"
            );
            previousInsertionPosition = insertionPosition;
            hasPreviousInsertion = true;
            totalFunding += addition.amount;
        }
    }

    function _copyExistingFunding(uint256 requestId, uint256 amendmentId)
        private
        view
        returns (IDeliveryEscrowLifecycle.ExistingMilestoneFunding[] memory copied)
    {
        ExistingMilestoneFunding[] storage stored = amendmentExistingFunding[requestId][
            amendmentId
        ];
        copied = new IDeliveryEscrowLifecycle.ExistingMilestoneFunding[](stored.length);
        for (uint256 i = 0; i < stored.length; i++) {
            copied[i] = IDeliveryEscrowLifecycle.ExistingMilestoneFunding({
                milestoneId: stored[i].milestoneId,
                amount: stored[i].amount
            });
        }
    }

    function _copyNewMilestones(uint256 requestId, uint256 amendmentId)
        private
        view
        returns (IDeliveryEscrowLifecycle.NewMilestoneFunding[] memory copied)
    {
        NewMilestoneFunding[] storage stored = amendmentNewMilestones[requestId][amendmentId];
        copied = new IDeliveryEscrowLifecycle.NewMilestoneFunding[](stored.length);
        for (uint256 i = 0; i < stored.length; i++) {
            copied[i] = IDeliveryEscrowLifecycle.NewMilestoneFunding({
                name: stored[i].name,
                insertBeforeMilestoneId: stored[i].insertBeforeMilestoneId,
                amount: stored[i].amount
            });
        }
    }

    function _refundStagedAmendment(uint256 requestId, uint256 amendmentId) private {
        AmendmentRequest storage amendment = amendmentRequests[requestId][amendmentId];
        (address shipper, , , , ) = deliveryEscrow.getLifecycleSnapshot(requestId);
        if (
            amendment.status != AmendmentStatus.Accepted
            && amendment.requester == shipper
            && amendment.additionalFunding + amendment.operationalAllowance > 0
        ) {
            cargoToken.safeTransfer(shipper, amendment.additionalFunding + amendment.operationalAllowance);
        }
        if (amendment.responseAllowance > amendment.responseAllowanceSpent) {
            uint256 remaining = amendment.responseAllowance - amendment.responseAllowanceSpent;
            amendment.responseAllowanceSpent = amendment.responseAllowance;
            cargoToken.safeTransfer(amendment.responseAllowanceFunder, remaining);
            emit AmendmentResponseAllowanceRefunded(
                requestId,
                amendmentId,
                amendment.responseAllowanceFunder,
                remaining
            );
        }
    }

    function _pendingAmendment(uint256 requestId, uint256 amendmentId)
        private
        view
        returns (AmendmentRequest storage amendment)
    {
        require(
            amendmentId < amendmentRequests[requestId].length,
            "amendment does not exist"
        );
        amendment = amendmentRequests[requestId][amendmentId];
        require(amendment.status == AmendmentStatus.Pending, "amendment is not pending");
        ActiveNegotiation storage negotiation = activeNegotiations[requestId];
        require(
            negotiation.kind == NegotiationKind.Amendment &&
                negotiation.negotiationId == amendmentId,
            "negotiation is not active"
        );
    }

    function _pendingCancellation(uint256 requestId, uint256 cancellationId)
        private
        view
        returns (CancellationRequest storage cancellation)
    {
        require(
            cancellationId < cancellationRequests[requestId].length,
            "cancellation does not exist"
        );
        cancellation = cancellationRequests[requestId][cancellationId];
        require(cancellation.status == CancellationStatus.Pending, "cancellation is not pending");
        ActiveNegotiation storage negotiation = activeNegotiations[requestId];
        require(
            negotiation.kind == NegotiationKind.Cancellation &&
                negotiation.negotiationId == cancellationId,
            "negotiation is not active"
        );
    }
}
