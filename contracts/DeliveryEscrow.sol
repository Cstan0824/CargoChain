// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./PaymentEvents.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Minimal registry surface required by the escrow contract.
interface IUserRegistry {
    function isRegistered(address user) external view returns (bool);
}

/// @title CargoChain MVP delivery escrow
/// @notice Single-contract MVP for request creation, carrier milestone proposal,
/// escrow funding, proof submission, verification, payout, and unpaid refunds.
contract DeliveryEscrow is PaymentEvents {
    using SafeERC20 for IERC20;
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

    /// @notice A carrier can have only one active proposal for a request.
    /// Historical proposal records are retained so proposal/revocation activity
    /// remains queryable on-chain.
    enum ProposalStatus {
        Active,
        Revoked,
        Rejected,
        Accepted
    }

    struct ItemInput {
        string itemName;
        string itemDescription;
        uint256 quantity;
    }

    struct MilestoneInput {
        string name;
        uint256 payoutPercentage;
    }

    struct Item {
        string itemName;
        string itemDescription;
        uint256 quantity;
    }

    struct DeliveryRequest {
        uint256 requestId;
        address shipper;
        address carrier;
        string pickupLocation;
        string deliveryLocation;
        uint256 totalAmount;
        uint256 releasedAmount;
        uint256 deadline;
        string specialInstruction;
        RequestStatus status;
        uint256 createdAt;
        uint256 proposedAmount;
        uint256 refundedAmount;
        uint256 operationalAllowance;
        uint256 operationalSpent;
        uint256 gasPriceCap;
    }

    struct Milestone {
        string name;
        uint256 payoutPercentage;
        uint256 payoutAmount;
        string[] proofUris;
        string remark;
        string rejectionReason;
        MilestoneStatus status;
        uint256 submittedAt;
        uint256 verifiedAt;
        uint256 additionalPayoutAmount;
        bool addedByAmendment;
        uint256 proofSubmissionNumber;
        uint8 proofWithdrawalsThisRound;
        bool submittedAfterRejection;
        bool proofSubmissionReimbursed;
        // Immutable identity. The execution order is stored separately so an
        // inserted checkpoint never changes the ID used by existing proofs,
        // payments, events, or off-chain history.
        uint256 milestoneId;
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

    struct CarrierProposal {
        address carrier;
        ProposalStatus status;
        uint256 createdAt;
        uint256 updatedAt;
        string rejectionNote;
    }

    struct ProposedMilestone {
        string name;
        uint256 payoutPercentage;
    }

    struct PaymentSummary {
        uint256 proposedAmount;
        uint256 totalFunded;
        uint256 totalReleased;
        uint256 totalRefunded;
        uint256 remainingEscrow;
        bool fullyFunded;
        bool fullyPaid;
        bool refundable;
        uint256 operationalAllowance;
        uint256 operationalSpent;
        uint256 operationalRemaining;
    }

    struct LockedEscrow {
        uint256 totalLocked;
        uint256 activeRequestCount;
    }

    IUserRegistry public immutable userRegistry;
    IERC20 public immutable cargoToken;
    address private immutable lifecycleManager;
    uint256 private constant MAX_PROPOSAL_REJECTION_NOTE_BYTES = 500;
    uint256 public constant MAX_INITIAL_MILESTONES = 10;
    uint256 public constant MAX_TOTAL_MILESTONES = 20;
    uint256 public constant MAX_PROOF_URI_BYTES = 512;
    uint256 public constant MAX_PROOF_REMARK_BYTES = 500;
    uint8 public constant MAX_PROOF_WITHDRAWALS_PER_ROUND = 5;
    uint256 public constant PROOF_GAS_UNIT_CAP = 250_000;
    uint256 public constant REIMBURSEMENT_OVERHEAD = 50_000;
    uint256 public constant MIN_GAS_PRICE = 2 gwei;
    uint256 public constant PRIORITY_FEE_BUFFER = 1 gwei;
    uint256 public constant CARGO_PER_ETH = 10_000;
    uint256 public constant MAX_PROOF_REIMBURSEMENT = 10 ether;
    /// @notice Sentinel used by amendment requests to append a checkpoint.
    /// Real milestone IDs begin at zero, so zero cannot represent append.
    uint256 public constant APPEND_MILESTONE_ID = type(uint256).max;
    uint256 private nextRequestId = 1;

    mapping(uint256 => DeliveryRequest) private requests;
    mapping(uint256 => Item[]) private requestItems;
    mapping(uint256 => mapping(uint256 => Milestone)) private requestMilestones;
    mapping(uint256 => mapping(uint256 => bool)) private milestoneExists;
    mapping(uint256 => uint256[]) private milestoneExecutionOrder;
    mapping(uint256 => uint256) private nextMilestoneId;
    mapping(uint256 => CarrierProposal[]) private requestProposals;
    mapping(uint256 => mapping(uint256 => ProposedMilestone[])) private proposalMilestones;
    mapping(uint256 => mapping(address => uint256)) private activeProposalIndexPlusOne;
    mapping(uint256 => uint256) private acceptedProposalIdPlusOne;
    mapping(address => LockedEscrow) private lockedEscrowByShipper;
    mapping(uint256 => uint256) private milestoneStateVersions;
    mapping(uint256 => uint256) public tipAmounts;
    uint256 public totalEscrowed;
    uint256[] private allRequestIds;
    uint256[] private openRequestIds;

    event RequestCreated(uint256 indexed requestId, address indexed shipper, uint256 proposedAmount);
    event MilestonePlanProposed(uint256 indexed requestId, address indexed carrier, uint256 proposalId);
    event MilestonePlanRevoked(uint256 indexed requestId, address indexed carrier, uint256 proposalId);
    event MilestonePlanRejected(uint256 indexed requestId, address indexed carrier, uint256 proposalId);
    event MilestonePlanAccepted(uint256 indexed requestId, address indexed carrier, uint256 proposalId);
    event ProofSubmitted(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        uint256 submissionNumber
    );
    event ProofWithdrawn(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        uint256 submissionNumber,
        uint8 withdrawalsThisRound
    );
    event MilestoneVerified(uint256 indexed requestId, uint256 indexed milestoneId, bool approved);
    event MilestonePaid(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        address indexed carrier,
        uint256 amount
    );
    event MilestoneRejected(uint256 indexed requestId, uint256 indexed milestoneId, string reason);
    event RequestCancelled(uint256 indexed requestId, address indexed shipper);
    event RequestCompleted(
        uint256 indexed requestId,
        address indexed carrier,
        uint256 completedAt
    );
    event RequestExpired(
        uint256 indexed requestId,
        address indexed carrier,
        uint256 deadline,
        uint256 expiredAt
    );
    event RequestAmended(
        uint256 indexed requestId,
        uint256 previousDeadline,
        uint256 newDeadline,
        uint256 additionalFunding,
        uint256 newMilestoneCount
    );
    event OperationalAllowanceFunded(uint256 indexed requestId, uint256 amount);
    event OperationalAllowanceReimbursed(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        address indexed carrier,
        uint256 amount
    );
    event OperationalAllowanceRefunded(uint256 indexed requestId, address indexed to, uint256 amount);

    constructor(
        address registryAddress,
        address lifecycleManagerAddress,
        address cargoTokenAddress
    ) {
        require(registryAddress != address(0), "registry address required");
        require(lifecycleManagerAddress != address(0), "lifecycle manager required");
        require(cargoTokenAddress != address(0), "cargo token required");
        userRegistry = IUserRegistry(registryAddress);
        lifecycleManager = lifecycleManagerAddress;
        cargoToken = IERC20(cargoTokenAddress);
    }

    modifier onlyRegistered() {
        require(userRegistry.isRegistered(msg.sender), "caller is not registered");
        _;
    }

    modifier requestExists(uint256 requestId) {
        require(requestId > 0 && requestId < nextRequestId, "request does not exist");
        _;
    }

    modifier onlyShipper(uint256 requestId) {
        require(msg.sender == requests[requestId].shipper, "caller is not shipper");
        _;
    }

    modifier onlyCarrier(uint256 requestId) {
        require(msg.sender == requests[requestId].carrier, "caller is not carrier");
        _;
    }

    function createRequest(
        string calldata pickupLocation,
        string calldata deliveryLocation,
        string calldata specialInstruction,
        uint256 deadline,
        uint256 proposedAmount,
        ItemInput[] calldata items
    ) external onlyRegistered returns (uint256 requestId) {
        require(bytes(pickupLocation).length > 0, "pickup required");
        require(bytes(deliveryLocation).length > 0, "delivery required");
        require(deadline > block.timestamp, "deadline must be future");
        require(proposedAmount > 0, "payment amount required");
        require(items.length > 0, "at least one item required");

        requestId = nextRequestId++;
        DeliveryRequest storage delivery = requests[requestId];
        delivery.requestId = requestId;
        delivery.shipper = msg.sender;
        delivery.pickupLocation = pickupLocation;
        delivery.deliveryLocation = deliveryLocation;
        delivery.deadline = deadline;
        delivery.specialInstruction = specialInstruction;
        delivery.status = RequestStatus.Open;
        delivery.createdAt = block.timestamp;
        delivery.proposedAmount = proposedAmount;

        for (uint256 i = 0; i < items.length; i++) {
            require(items[i].quantity > 0, "item quantity must be positive");
            require(bytes(items[i].itemName).length > 0, "item name required");
            requestItems[requestId].push(
                Item({
                    itemName: items[i].itemName,
                    itemDescription: items[i].itemDescription,
                    quantity: items[i].quantity
                })
            );
        }

        allRequestIds.push(requestId);
        openRequestIds.push(requestId);
        emit RequestCreated(requestId, msg.sender, proposedAmount);
    }

    function proposeMilestones(
        uint256 requestId,
        MilestoneInput[] calldata milestones
    ) external onlyRegistered requestExists(requestId) {
        DeliveryRequest storage delivery = requests[requestId];
        require(delivery.status == RequestStatus.Open, "request is not open");
        require(msg.sender != delivery.shipper, "shipper cannot be carrier");
        require(activeProposalIndexPlusOne[requestId][msg.sender] == 0, "carrier already has active proposal");
        require(milestones.length > 0, "at least one milestone required");
        require(milestones.length <= MAX_INITIAL_MILESTONES, "too many milestones");

        uint256 totalPercentage = 0;
        for (uint256 i = 0; i < milestones.length; i++) {
            require(bytes(milestones[i].name).length > 0, "milestone name required");
            require(milestones[i].payoutPercentage > 0, "payout must be positive");
            totalPercentage += milestones[i].payoutPercentage;
        }
        require(totalPercentage == 100, "payout percentages must equal 100");

        uint256 proposalId = requestProposals[requestId].length;
        requestProposals[requestId].push(
            CarrierProposal({
                carrier: msg.sender,
                status: ProposalStatus.Active,
                createdAt: block.timestamp,
                updatedAt: block.timestamp,
                rejectionNote: ""
            })
        );
        activeProposalIndexPlusOne[requestId][msg.sender] = proposalId + 1;

        for (uint256 i = 0; i < milestones.length; i++) {
            proposalMilestones[requestId][proposalId].push(
                ProposedMilestone({
                    name: milestones[i].name,
                    payoutPercentage: milestones[i].payoutPercentage
                })
            );
        }

        emit MilestonePlanProposed(requestId, msg.sender, proposalId);
    }

    function revokeMilestoneProposal(uint256 requestId)
        external
        onlyRegistered
        requestExists(requestId)
    {
        DeliveryRequest storage delivery = requests[requestId];
        require(delivery.status == RequestStatus.Open, "request is not open");

        uint256 activeIndexPlusOne = activeProposalIndexPlusOne[requestId][msg.sender];
        require(activeIndexPlusOne > 0, "no active proposal to revoke");
        uint256 proposalId = activeIndexPlusOne - 1;
        CarrierProposal storage proposal = requestProposals[requestId][proposalId];

        proposal.status = ProposalStatus.Revoked;
        proposal.updatedAt = block.timestamp;
        activeProposalIndexPlusOne[requestId][msg.sender] = 0;

        emit MilestonePlanRevoked(requestId, msg.sender, proposalId);
    }

    function rejectMilestoneProposal(
        uint256 requestId,
        uint256 proposalId,
        string calldata rejectionNote
    )
        external
        onlyRegistered
        requestExists(requestId)
        onlyShipper(requestId)
    {
        DeliveryRequest storage delivery = requests[requestId];
        require(delivery.status == RequestStatus.Open, "request is not open");
        require(proposalId < requestProposals[requestId].length, "proposal does not exist");

        CarrierProposal storage proposal = requestProposals[requestId][proposalId];
        require(proposal.status == ProposalStatus.Active, "proposal is not active");
        require(
            bytes(rejectionNote).length <= MAX_PROPOSAL_REJECTION_NOTE_BYTES,
            "rejection note too long"
        );
        proposal.status = ProposalStatus.Rejected;
        proposal.updatedAt = block.timestamp;
        proposal.rejectionNote = rejectionNote;
        activeProposalIndexPlusOne[requestId][proposal.carrier] = 0;

        emit MilestonePlanRejected(requestId, proposal.carrier, proposalId);
    }

    function approveAndFund(uint256 requestId, uint256 proposalId)
        external
        onlyRegistered
        requestExists(requestId)
        onlyShipper(requestId)
    {
        _approveAndFund(requestId, proposalId, minimumOperationalAllowance(requestId, proposalId));
    }

    function approveAndFundWithAllowance(uint256 requestId, uint256 proposalId, uint256 operationalAllowance)
        external
        onlyRegistered
        requestExists(requestId)
        onlyShipper(requestId)
    {
        _approveAndFund(requestId, proposalId, operationalAllowance);
    }

    function _approveAndFund(
        uint256 requestId,
        uint256 proposalId,
        uint256 operationalAllowance
    ) private {
        DeliveryRequest storage delivery = requests[requestId];
        require(delivery.status == RequestStatus.Open, "request is not open");
        require(block.timestamp <= delivery.deadline, "request deadline has passed");
        require(proposalId < requestProposals[requestId].length, "proposal does not exist");
        require(
            operationalAllowance >= minimumOperationalAllowance(requestId, proposalId),
            "operational allowance below minimum"
        );

        CarrierProposal storage proposal = requestProposals[requestId][proposalId];
        require(proposal.status == ProposalStatus.Active, "proposal is not active");
        ProposedMilestone[] storage selectedMilestones = proposalMilestones[requestId][proposalId];
        require(selectedMilestones.length > 0, "no milestones proposed");

        require(
            cargoToken.allowance(msg.sender, address(this)) >= delivery.proposedAmount + operationalAllowance,
            "CARGO allowance too low"
        );
        cargoToken.safeTransferFrom(
            msg.sender,
            address(this),
            delivery.proposedAmount + operationalAllowance
        );
        totalEscrowed += delivery.proposedAmount;
        totalEscrowed += operationalAllowance;
        delivery.carrier = proposal.carrier;
        acceptedProposalIdPlusOne[requestId] = proposalId + 1;
        proposal.status = ProposalStatus.Accepted;
        proposal.updatedAt = block.timestamp;
        activeProposalIndexPlusOne[requestId][proposal.carrier] = 0;

        _removeOpenRequestId(requestId);

        for (uint256 i = 0; i < selectedMilestones.length; i++) {
            uint256 milestoneId = _createMilestone(
                requestId,
                selectedMilestones[i].name,
                selectedMilestones[i].payoutPercentage,
                0,
                false
            );
            milestoneExecutionOrder[requestId].push(milestoneId);
        }

        uint256[] storage executionOrder = milestoneExecutionOrder[requestId];

        delivery.totalAmount = delivery.proposedAmount;
        delivery.status = RequestStatus.Funded;
        LockedEscrow storage lockedEscrow = lockedEscrowByShipper[delivery.shipper];
        lockedEscrow.totalLocked += delivery.proposedAmount + operationalAllowance;
        lockedEscrow.activeRequestCount += 1;
        delivery.operationalAllowance = operationalAllowance;
        delivery.gasPriceCap = referenceGasPrice();

        uint256 allocated = 0;
        for (uint256 i = 0; i < executionOrder.length; i++) {
            Milestone storage milestone = requestMilestones[requestId][executionOrder[i]];
            milestone.status = MilestoneStatus.PendingProof;
            if (i == executionOrder.length - 1) {
                milestone.payoutAmount = delivery.proposedAmount - allocated;
            } else {
                uint256 amount = (delivery.proposedAmount * milestone.payoutPercentage) / 100;
                milestone.payoutAmount = amount;
                allocated += amount;
            }
        }
        milestoneStateVersions[requestId] = 1;

        emit MilestonePlanAccepted(requestId, proposal.carrier, proposalId);
        emit EscrowFunded(requestId, delivery.proposedAmount);
        emit OperationalAllowanceFunded(requestId, operationalAllowance);
    }

    function submitProof(
        uint256 requestId,
        uint256 milestoneId,
        string[] calldata proofUris,
        string calldata remark
    ) external onlyRegistered requestExists(requestId) onlyCarrier(requestId) {
        uint256 gasAtStart = gasleft();
        DeliveryRequest storage delivery = requests[requestId];
        require(
            delivery.status == RequestStatus.Funded || delivery.status == RequestStatus.InProgress,
            "request is not active"
        );
        require(block.timestamp <= delivery.deadline, "request deadline has passed");
        require(proofUris.length == 1, "exactly one proof uri required");
        Milestone storage milestone = _milestoneFor(requestId, milestoneId);
        _requirePreviousMilestonePaid(requestId, milestoneId);
        require(
            milestone.status == MilestoneStatus.PendingProof || milestone.status == MilestoneStatus.Rejected,
            "milestone is not waiting for proof"
        );

        bool wasRejected = milestone.status == MilestoneStatus.Rejected;
        require(bytes(proofUris[0]).length > 0, "proof uri required");
        require(bytes(proofUris[0]).length <= MAX_PROOF_URI_BYTES, "proof uri too long");
        require(bytes(remark).length <= MAX_PROOF_REMARK_BYTES, "proof remark too long");

        delete milestone.proofUris;
        milestone.proofUris.push(proofUris[0]);

        milestone.remark = remark;
        if (!wasRejected) {
            milestone.rejectionReason = "";
        }
        milestone.submittedAfterRejection = wasRejected;
        milestone.proofSubmissionNumber += 1;
        milestone.status = MilestoneStatus.Submitted;
        milestone.submittedAt = block.timestamp;
        delivery.status = RequestStatus.InProgress;
        _markMilestoneStateChanged(requestId);

        _reimburseProofSubmission(requestId, milestoneId, gasAtStart);

        emit ProofSubmitted(requestId, milestoneId, milestone.proofSubmissionNumber);
    }

    /// @notice Withdraw the current proof before shipper review.
    /// A corrected proof returns to Rejected so the latest rejection reason is
    /// preserved. The withdrawal count resets only after shipper rejection.
    function withdrawProof(uint256 requestId, uint256 milestoneId)
        external
        onlyRegistered
        requestExists(requestId)
        onlyCarrier(requestId)
    {
        DeliveryRequest storage delivery = requests[requestId];
        require(
            delivery.status == RequestStatus.Funded || delivery.status == RequestStatus.InProgress,
            "request is not active"
        );
        require(block.timestamp <= delivery.deadline, "request deadline has passed");
        Milestone storage milestone = _milestoneFor(requestId, milestoneId);
        require(milestone.status == MilestoneStatus.Submitted, "milestone is not submitted");
        require(
            milestone.proofWithdrawalsThisRound < MAX_PROOF_WITHDRAWALS_PER_ROUND,
            "proof withdrawal limit reached"
        );

        delete milestone.proofUris;
        milestone.remark = "";
        milestone.status = milestone.submittedAfterRejection
            ? MilestoneStatus.Rejected
            : MilestoneStatus.PendingProof;
        milestone.submittedAfterRejection = false;
        milestone.proofWithdrawalsThisRound += 1;
        _markMilestoneStateChanged(requestId);

        emit ProofWithdrawn(
            requestId,
            milestoneId,
            milestone.proofSubmissionNumber,
            milestone.proofWithdrawalsThisRound
        );
    }

    function verifyMilestone(
        uint256 requestId,
        uint256 milestoneId,
        bool approve,
        string calldata rejectionReason
    ) external onlyRegistered requestExists(requestId) onlyShipper(requestId) {
        Milestone storage milestone = _milestoneFor(requestId, milestoneId);
        _requirePreviousMilestonePaid(requestId, milestoneId);
        require(milestone.status == MilestoneStatus.Submitted, "milestone is not submitted");

        if (!approve) {
            require(bytes(rejectionReason).length > 0, "rejection reason required");
            milestone.status = MilestoneStatus.Rejected;
            milestone.rejectionReason = rejectionReason;
            milestone.proofWithdrawalsThisRound = 0;
            milestone.submittedAfterRejection = false;
            _markMilestoneStateChanged(requestId);
            emit MilestoneVerified(requestId, milestoneId, false);
            emit MilestoneRejected(requestId, milestoneId, rejectionReason);
            return;
        }

        milestone.status = MilestoneStatus.Verified;
        milestone.verifiedAt = block.timestamp;
        _markMilestoneStateChanged(requestId);
        emit MilestoneVerified(requestId, milestoneId, true);

        _releaseMilestonePayment(requestId, milestoneId);
    }

    function cancelRequest(uint256 requestId)
        external
        onlyRegistered
        requestExists(requestId)
        onlyShipper(requestId)
    {
        DeliveryRequest storage delivery = requests[requestId];
        require(
            delivery.status == RequestStatus.Open ||
                delivery.status == RequestStatus.PendingApproval,
            "request cannot be cancelled"
        );

        if (delivery.status == RequestStatus.Open) {
            _removeOpenRequestId(requestId);
        }

        delivery.status = RequestStatus.Cancelled;
        emit RequestCancelled(requestId, msg.sender);

    }

    /// @notice Finalizes a cancellation already accepted by both shipment parties.
    /// @dev Only LifecycleManager may call this narrow escrow settlement hook.
    function finalizeMutualCancellation(uint256 requestId)
        external
        requestExists(requestId)
    {
        require(msg.sender == lifecycleManager, "caller is not lifecycle manager");
        DeliveryRequest storage delivery = requests[requestId];
        require(
            delivery.status == RequestStatus.Funded ||
                delivery.status == RequestStatus.InProgress,
            "request is not active"
        );

        delivery.status = RequestStatus.Cancelled;
        emit RequestCancelled(requestId, delivery.shipper);
        _refund(requestId, escrowBalance(requestId));
    }

    /// @notice Applies an amendment already approved under LifecycleManager.
    /// Original milestone payouts and completed progress are never rewritten;
    /// all allocations here are funded by CARGO transferred by LifecycleManager.
    function finalizeAmendment(
        uint256 requestId,
        uint256 newDeadline,
        ExistingMilestoneFunding[] calldata existingFunding,
        NewMilestoneFunding[] calldata newMilestones,
        uint256 additionalOperationalAllowance
    ) external requestExists(requestId) {
        require(msg.sender == lifecycleManager, "caller is not lifecycle manager");
        DeliveryRequest storage delivery = requests[requestId];
        require(
            delivery.status == RequestStatus.Funded ||
                delivery.status == RequestStatus.InProgress,
            "request is not active"
        );
        require(newDeadline > block.timestamp, "deadline must be future");

        uint256 allocated;
        uint256 baseMilestoneCount = milestoneExecutionOrder[requestId].length;
        for (uint256 i = 0; i < existingFunding.length; i++) {
            ExistingMilestoneFunding calldata allocation = existingFunding[i];
            require(allocation.amount > 0, "allocation must be positive");
            require(milestoneExists[requestId][allocation.milestoneId], "milestone does not exist");
            for (uint256 previous = 0; previous < i; previous++) {
                require(
                    existingFunding[previous].milestoneId != allocation.milestoneId,
                    "existing milestones must be unique"
                );
            }
            require(
                requestMilestones[requestId][allocation.milestoneId].status !=
                    MilestoneStatus.Paid,
                "paid milestone cannot be funded"
            );
            allocated += allocation.amount;
        }

        uint256 previousInsertionPosition;
        bool hasPreviousInsertion;
        for (uint256 i = 0; i < newMilestones.length; i++) {
            NewMilestoneFunding calldata addition = newMilestones[i];
            require(bytes(addition.name).length > 0, "milestone name required");
            require(addition.amount > 0, "allocation must be positive");
            uint256 insertionPosition = baseMilestoneCount;
            if (addition.insertBeforeMilestoneId != APPEND_MILESTONE_ID) {
                require(
                    milestoneExists[requestId][addition.insertBeforeMilestoneId],
                    "insertion milestone does not exist"
                );
                MilestoneStatus targetStatus = requestMilestones[requestId][
                    addition.insertBeforeMilestoneId
                ].status;
                require(
                    targetStatus == MilestoneStatus.PendingProof ||
                        targetStatus == MilestoneStatus.Rejected,
                    "new milestone must precede eligible milestone"
                );
                insertionPosition = _executionIndex(requestId, addition.insertBeforeMilestoneId);
            }
            require(
                !hasPreviousInsertion || insertionPosition >= previousInsertionPosition,
                "new milestones must be ordered"
            );
            previousInsertionPosition = insertionPosition;
            hasPreviousInsertion = true;
            allocated += addition.amount;
        }
        uint256 additionalFunding = allocated;
        require(
            cargoToken.balanceOf(address(this)) >= totalEscrowed + additionalFunding + additionalOperationalAllowance,
            "amendment funding not received"
        );

        for (uint256 i = 0; i < existingFunding.length; i++) {
            ExistingMilestoneFunding calldata allocation = existingFunding[i];
            requestMilestones[requestId][allocation.milestoneId]
                .additionalPayoutAmount += allocation.amount;
        }

        for (uint256 i = 0; i < newMilestones.length; i++) {
            NewMilestoneFunding calldata addition = newMilestones[i];
            _insertAmendmentMilestone(
                requestId,
                addition.insertBeforeMilestoneId,
                addition.name,
                addition.amount
            );
        }

        uint256 previousDeadline = delivery.deadline;
        delivery.deadline = newDeadline;
        if (additionalFunding > 0) {
            delivery.totalAmount += additionalFunding;
            totalEscrowed += additionalFunding;
            lockedEscrowByShipper[delivery.shipper].totalLocked += additionalFunding;
            emit EscrowFunded(requestId, additionalFunding);
        }
        if (additionalOperationalAllowance > 0) {
            delivery.operationalAllowance += additionalOperationalAllowance;
            totalEscrowed += additionalOperationalAllowance;
            lockedEscrowByShipper[delivery.shipper].totalLocked += additionalOperationalAllowance;
            emit OperationalAllowanceFunded(requestId, additionalOperationalAllowance);
        }
        _markMilestoneStateChanged(requestId);
        emit RequestAmended(
            requestId,
            previousDeadline,
            newDeadline,
            additionalFunding,
            newMilestones.length
        );
    }

    function refundRemaining(uint256 requestId)
        external
        onlyRegistered
        requestExists(requestId)
        onlyShipper(requestId)
    {
        DeliveryRequest storage delivery = requests[requestId];
        require(delivery.status != RequestStatus.Completed, "completed request cannot be refunded");
        require(delivery.status != RequestStatus.Refunded, "request already refunded");

        bool alreadyFailed = delivery.status == RequestStatus.Cancelled ||
            delivery.status == RequestStatus.Expired;
        bool activeButExpired = delivery.status == RequestStatus.Funded ||
            delivery.status == RequestStatus.InProgress;
        require(alreadyFailed || activeButExpired, "request is not refundable");

        if (activeButExpired) {
            require(block.timestamp > delivery.deadline, "request deadline has not passed");
            delivery.status = RequestStatus.Expired;
            emit RequestExpired(
                requestId,
                delivery.carrier,
                delivery.deadline,
                block.timestamp
            );
        }

        uint256 remaining = escrowBalance(requestId);
        require(remaining > 0, "no escrow remaining");
        _refund(requestId, remaining);
    }

    /// @notice Sends one optional post-completion tip directly to the carrier.
    /// @dev The tip is not escrow and never changes milestone or refund totals.
    function tipCarrier(uint256 requestId, uint256 amount)
        external
        onlyRegistered
        requestExists(requestId)
        onlyShipper(requestId)
    {
        DeliveryRequest storage delivery = requests[requestId];
        require(delivery.status == RequestStatus.Completed, "request is not completed");
        require(amount > 0, "tip amount required");
        require(tipAmounts[requestId] == 0, "tip already sent");

        cargoToken.safeTransferFrom(msg.sender, delivery.carrier, amount);
        tipAmounts[requestId] = amount;

        emit CarrierTipped(requestId, delivery.shipper, delivery.carrier, amount);
    }

    function getRequestCount() external view returns (uint256) {
        return allRequestIds.length;
    }

    function getRequestIds(uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return _sliceIds(allRequestIds, offset, limit);
    }

    function getOpenRequests(uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return _sliceIds(openRequestIds, offset, limit);
    }

    function getRequest(uint256 requestId)
        external
        view
        requestExists(requestId)
        returns (DeliveryRequest memory)
    {
        return requests[requestId];
    }

    function getItems(uint256 requestId)
        external
        view
        requestExists(requestId)
        returns (Item[] memory)
    {
        return requestItems[requestId];
    }

    function getMilestones(uint256 requestId)
        external
        view
        requestExists(requestId)
        returns (Milestone[] memory)
    {
        uint256[] storage executionOrder = milestoneExecutionOrder[requestId];
        Milestone[] memory milestones = new Milestone[](executionOrder.length);
        for (uint256 i = 0; i < executionOrder.length; i++) {
            milestones[i] = _copyMilestone(
                requestMilestones[requestId][executionOrder[i]]
            );
        }
        return milestones;
    }

    function getProposals(uint256 requestId)
        external
        view
        requestExists(requestId)
        returns (CarrierProposal[] memory)
    {
        CarrierProposal[] storage stored = requestProposals[requestId];
        CarrierProposal[] memory proposals = new CarrierProposal[](stored.length);
        uint256 acceptedIdPlusOne = acceptedProposalIdPlusOne[requestId];
        for (uint256 i = 0; i < stored.length; i++) {
            proposals[i] = stored[i];
            if (
                proposals[i].status == ProposalStatus.Active &&
                acceptedIdPlusOne > 0 &&
                i + 1 != acceptedIdPlusOne
            ) {
                proposals[i].status = ProposalStatus.Rejected;
                proposals[i].rejectionNote = "Another carrier proposal was accepted.";
            }
        }
        return proposals;
    }

    function getProposalMilestones(uint256 requestId, uint256 proposalId)
        external
        view
        requestExists(requestId)
        returns (ProposedMilestone[] memory)
    {
        require(proposalId < requestProposals[requestId].length, "proposal does not exist");
        return proposalMilestones[requestId][proposalId];
    }

    function getMilestone(uint256 requestId, uint256 milestoneId)
        external
        view
        requestExists(requestId)
        returns (Milestone memory)
    {
        return _copyMilestone(_milestoneFor(requestId, milestoneId));
    }

    function getMilestoneCount(uint256 requestId)
        external
        view
        requestExists(requestId)
        returns (uint256)
    {
        return milestoneExecutionOrder[requestId].length;
    }

    /// @notice Returns stable milestone IDs in their required completion order.
    function getMilestoneExecutionOrder(uint256 requestId)
        external
        view
        requestExists(requestId)
        returns (uint256[] memory)
    {
        return milestoneExecutionOrder[requestId];
    }

    /// @notice Returns the current execution position for a stable milestone ID.
    function getMilestoneExecutionIndex(uint256 requestId, uint256 milestoneId)
        external
        view
        requestExists(requestId)
        returns (uint256)
    {
        return _executionIndex(requestId, milestoneId);
    }

    function getMilestoneStatus(uint256 requestId, uint256 milestoneId)
        external
        view
        requestExists(requestId)
        returns (MilestoneStatus)
    {
        return _milestoneFor(requestId, milestoneId).status;
    }

    function getProofUris(uint256 requestId, uint256 milestoneId)
        external
        view
        requestExists(requestId)
        returns (string[] memory)
    {
        return _milestoneFor(requestId, milestoneId).proofUris;
    }

    /// @notice Reports whether any proof is waiting for the shipper's decision.
    /// Mutual cancellation acceptance must use this guard before refunding.
    function hasPendingMilestoneProof(uint256 requestId)
        public
        view
        requestExists(requestId)
        returns (bool)
    {
        return _hasPendingMilestoneProof(requestId);
    }

    /// @notice Narrow, stable read surface consumed by LifecycleManager.
    /// Dynamic request strings are intentionally excluded so unrelated
    /// DeliveryRequest changes cannot break cross-contract ABI decoding.
    function getLifecycleSnapshot(uint256 requestId)
        external
        view
        requestExists(requestId)
        returns (
            address shipper,
            address carrier,
            RequestStatus status,
            uint256 deadline,
            uint256 milestoneStateVersion
        )
    {
        DeliveryRequest storage delivery = requests[requestId];
        return (
            delivery.shipper,
            delivery.carrier,
            delivery.status,
            delivery.deadline,
            milestoneStateVersions[requestId]
        );
    }

    function _hasPendingMilestoneProof(uint256 requestId) private view returns (bool) {
        uint256[] storage executionOrder = milestoneExecutionOrder[requestId];
        for (uint256 i = 0; i < executionOrder.length; i++) {
            if (
                requestMilestones[requestId][executionOrder[i]].status ==
                MilestoneStatus.Submitted
            ) {
                return true;
            }
        }
        return false;
    }

    /// @notice Monotonically increases whenever proof submission or review
    /// changes milestone progress after a proposal has been funded.
    function getMilestoneStateVersion(uint256 requestId)
        external
        view
        requestExists(requestId)
        returns (uint256)
    {
        return milestoneStateVersions[requestId];
    }

    function escrowBalance(uint256 requestId) public view requestExists(requestId) returns (uint256) {
        DeliveryRequest storage delivery = requests[requestId];
        return delivery.totalAmount - delivery.releasedAmount - delivery.refundedAmount;
    }

    function getLockedEscrow(address shipper)
        external
        view
        returns (uint256 totalLocked, uint256 activeRequestCount)
    {
        LockedEscrow storage lockedEscrow = lockedEscrowByShipper[shipper];
        return (lockedEscrow.totalLocked, lockedEscrow.activeRequestCount);
    }

    function getPaymentSummary(uint256 requestId)
        external
        view
        requestExists(requestId)
        returns (PaymentSummary memory)
    {
        DeliveryRequest storage delivery = requests[requestId];
        uint256 remaining = escrowBalance(requestId);
        bool funded = delivery.totalAmount > 0 &&
            delivery.totalAmount >= delivery.proposedAmount;
        bool paid = funded && delivery.releasedAmount == delivery.totalAmount &&
            delivery.status == RequestStatus.Completed;

        return PaymentSummary({
            proposedAmount: delivery.proposedAmount,
            totalFunded: delivery.totalAmount,
            totalReleased: delivery.releasedAmount,
            totalRefunded: delivery.refundedAmount,
            remainingEscrow: remaining,
            fullyFunded: funded,
            fullyPaid: paid,
            refundable: _isRefundable(delivery, remaining),
            operationalAllowance: delivery.operationalAllowance,
            operationalSpent: delivery.operationalSpent,
            operationalRemaining: delivery.operationalAllowance > delivery.operationalSpent
                ? delivery.operationalAllowance - delivery.operationalSpent
                : 0
        });
    }

    /// @notice Gas-price reference used for mandatory operational reserves.
    function referenceGasPrice() public view returns (uint256) {
        uint256 basePlusPriority = block.basefee + PRIORITY_FEE_BUFFER;
        return basePlusPriority > MIN_GAS_PRICE ? basePlusPriority : MIN_GAS_PRICE;
    }

    /// @notice Minimum reserve for every eligible first proof submission in a proposal.
    function minimumOperationalAllowance(uint256 requestId, uint256 proposalId)
        public
        view
        requestExists(requestId)
        returns (uint256)
    {
        require(proposalId < requestProposals[requestId].length, "proposal does not exist");
        uint256 actionCount = proposalMilestones[requestId][proposalId].length;
        return actionCount * minimumProofAllowance();
    }

    function minimumProofAllowance() public view returns (uint256) {
        return (PROOF_GAS_UNIT_CAP + REIMBURSEMENT_OVERHEAD)
            * referenceGasPrice()
            * CARGO_PER_ETH;
    }

    /// @notice Add refundable CARGO reserve for future carrier proof submissions.
    function topUpOperationalAllowance(uint256 requestId, uint256 amount)
        external
        onlyRegistered
        requestExists(requestId)
        onlyShipper(requestId)
    {
        DeliveryRequest storage delivery = requests[requestId];
        require(
            delivery.status == RequestStatus.Funded || delivery.status == RequestStatus.InProgress,
            "request is not active"
        );
        require(amount > 0, "top-up amount required");
        require(cargoToken.allowance(msg.sender, address(this)) >= amount, "CARGO allowance too low");
        cargoToken.safeTransferFrom(msg.sender, address(this), amount);
        delivery.operationalAllowance += amount;
        totalEscrowed += amount;
        lockedEscrowByShipper[msg.sender].totalLocked += amount;
        emit OperationalAllowanceFunded(requestId, amount);
    }

    function _reimburseProofSubmission(
        uint256 requestId,
        uint256 milestoneId,
        uint256 gasAtStart
    ) private {
        DeliveryRequest storage delivery = requests[requestId];
        Milestone storage milestone = requestMilestones[requestId][milestoneId];
        if (milestone.proofSubmissionReimbursed) return;
        milestone.proofSubmissionReimbursed = true;

        uint256 measuredGas = gasAtStart - gasleft() + REIMBURSEMENT_OVERHEAD;
        if (measuredGas > PROOF_GAS_UNIT_CAP) measuredGas = PROOF_GAS_UNIT_CAP;
        uint256 coveredGasPrice = tx.gasprice < delivery.gasPriceCap
            ? tx.gasprice
            : delivery.gasPriceCap;
        uint256 calculated = measuredGas * coveredGasPrice * CARGO_PER_ETH;
        if (calculated > MAX_PROOF_REIMBURSEMENT) calculated = MAX_PROOF_REIMBURSEMENT;

        uint256 remainingAllowance = delivery.operationalAllowance > delivery.operationalSpent
            ? delivery.operationalAllowance - delivery.operationalSpent
            : 0;
        uint256 futureReserve = _minimumFutureOperationalReserve(requestId, milestoneId);
        uint256 spendable = remainingAllowance > futureReserve
            ? remainingAllowance - futureReserve
            : 0;
        if (calculated > spendable) calculated = spendable;
        if (calculated == 0) return;

        delivery.operationalSpent += calculated;
        totalEscrowed -= calculated;
        _decreaseLockedEscrow(delivery.shipper, calculated, false);
        cargoToken.safeTransfer(delivery.carrier, calculated);
        emit OperationalAllowanceReimbursed(requestId, milestoneId, delivery.carrier, calculated);
    }

    function _minimumFutureOperationalReserve(uint256 requestId, uint256 currentMilestoneId)
        private
        view
        returns (uint256 reserve)
    {
        uint256 currentIndex = _executionIndex(requestId, currentMilestoneId);
        uint256[] storage executionOrder = milestoneExecutionOrder[requestId];
        uint256 perAction = (PROOF_GAS_UNIT_CAP + REIMBURSEMENT_OVERHEAD)
            * referenceGasPrice()
            * CARGO_PER_ETH;
        for (uint256 i = currentIndex + 1; i < executionOrder.length; i++) {
            if (requestMilestones[requestId][executionOrder[i]].status != MilestoneStatus.Paid) {
                reserve += perAction;
            }
        }
    }

    function _refundOperationalAllowance(uint256 requestId) private {
        DeliveryRequest storage delivery = requests[requestId];
        uint256 remaining = delivery.operationalAllowance > delivery.operationalSpent
            ? delivery.operationalAllowance - delivery.operationalSpent
            : 0;
        if (remaining == 0) return;

        delivery.operationalSpent = delivery.operationalAllowance;
        totalEscrowed -= remaining;
        _decreaseLockedEscrow(delivery.shipper, remaining, false);
        cargoToken.safeTransfer(delivery.shipper, remaining);
        emit OperationalAllowanceRefunded(requestId, delivery.shipper, remaining);
    }

    function _markMilestoneStateChanged(uint256 requestId) private {
        milestoneStateVersions[requestId] += 1;
    }

    function _createMilestone(
        uint256 requestId,
        string memory name,
        uint256 payoutPercentage,
        uint256 additionalPayoutAmount,
        bool addedByAmendment
    ) private returns (uint256 milestoneId) {
        milestoneId = nextMilestoneId[requestId];
        nextMilestoneId[requestId] = milestoneId + 1;
        milestoneExists[requestId][milestoneId] = true;

        Milestone storage milestone = requestMilestones[requestId][milestoneId];
        milestone.milestoneId = milestoneId;
        milestone.name = name;
        milestone.payoutPercentage = payoutPercentage;
        milestone.status = MilestoneStatus.PendingProof;
        milestone.additionalPayoutAmount = additionalPayoutAmount;
        milestone.addedByAmendment = addedByAmendment;
    }

    function _milestoneFor(uint256 requestId, uint256 milestoneId)
        private
        view
        returns (Milestone storage)
    {
        require(milestoneExists[requestId][milestoneId], "milestone does not exist");
        return requestMilestones[requestId][milestoneId];
    }

    function _executionIndex(uint256 requestId, uint256 milestoneId)
        private
        view
        returns (uint256)
    {
        require(milestoneExists[requestId][milestoneId], "milestone does not exist");
        uint256[] storage executionOrder = milestoneExecutionOrder[requestId];
        for (uint256 i = 0; i < executionOrder.length; i++) {
            if (executionOrder[i] == milestoneId) {
                return i;
            }
        }
        revert("milestone is not ordered");
    }

    function _requirePreviousMilestonePaid(uint256 requestId, uint256 milestoneId)
        private
        view
    {
        uint256 executionIndex = _executionIndex(requestId, milestoneId);
        if (executionIndex == 0) {
            return;
        }
        uint256 previousMilestoneId = milestoneExecutionOrder[requestId][executionIndex - 1];
        require(
            requestMilestones[requestId][previousMilestoneId].status ==
                MilestoneStatus.Paid,
            "previous milestone is not paid"
        );
    }

    function _copyMilestone(Milestone storage source)
        private
        view
        returns (Milestone memory milestone)
    {
        milestone.milestoneId = source.milestoneId;
        milestone.name = source.name;
        milestone.payoutPercentage = source.payoutPercentage;
        milestone.payoutAmount = source.payoutAmount;
        milestone.proofUris = source.proofUris;
        milestone.remark = source.remark;
        milestone.rejectionReason = source.rejectionReason;
        milestone.status = source.status;
        milestone.submittedAt = source.submittedAt;
        milestone.verifiedAt = source.verifiedAt;
        milestone.additionalPayoutAmount = source.additionalPayoutAmount;
        milestone.addedByAmendment = source.addedByAmendment;
        milestone.proofSubmissionNumber = source.proofSubmissionNumber;
        milestone.proofWithdrawalsThisRound = source.proofWithdrawalsThisRound;
        milestone.submittedAfterRejection = source.submittedAfterRejection;
        milestone.proofSubmissionReimbursed = source.proofSubmissionReimbursed;
    }

    function _releaseMilestonePayment(uint256 requestId, uint256 milestoneId) private {
        DeliveryRequest storage delivery = requests[requestId];
        Milestone storage milestone = requestMilestones[requestId][milestoneId];
        require(milestone.status == MilestoneStatus.Verified, "milestone is not verified");
        uint256 amount = milestone.payoutAmount + milestone.additionalPayoutAmount;
        require(amount > 0, "milestone has no payout");
        require(escrowBalance(requestId) >= amount, "insufficient escrow");

        uint256 remainingBeforePayment = escrowBalance(requestId);
        milestone.status = MilestoneStatus.Paid;
        delivery.releasedAmount += amount;
        totalEscrowed -= amount;
        _decreaseLockedEscrow(
            delivery.shipper,
            amount,
            remainingBeforePayment == amount
        );

        bool completed = _allMilestonesPaid(requestId);
        if (completed) {
            delivery.status = RequestStatus.Completed;
        }

        cargoToken.safeTransfer(delivery.carrier, amount);
        emit MilestonePaid(requestId, milestoneId, delivery.carrier, amount);
        emit PaymentReleased(requestId, milestoneId, amount, delivery.carrier);
        if (completed) {
            emit RequestCompleted(requestId, delivery.carrier, block.timestamp);
            _refundOperationalAllowance(requestId);
        }
    }

    function _insertAmendmentMilestone(
        uint256 requestId,
        uint256 insertBeforeMilestoneId,
        string calldata name,
        uint256 amount
    ) private {
        uint256 milestoneId = _createMilestone(requestId, name, 0, amount, true);
        uint256[] storage executionOrder = milestoneExecutionOrder[requestId];

        if (insertBeforeMilestoneId == APPEND_MILESTONE_ID) {
            executionOrder.push(milestoneId);
            return;
        }

        uint256 insertionIndex = _executionIndex(requestId, insertBeforeMilestoneId);
        executionOrder.push(milestoneId);
        for (uint256 i = executionOrder.length - 1; i > insertionIndex; i--) {
            executionOrder[i] = executionOrder[i - 1];
        }
        executionOrder[insertionIndex] = milestoneId;
    }

    function _refund(uint256 requestId, uint256 amount) private {
        DeliveryRequest storage delivery = requests[requestId];
        uint256 remainingBeforeRefund = escrowBalance(requestId);
        require(amount > 0 && amount <= remainingBeforeRefund, "invalid refund amount");
        delivery.refundedAmount += amount;
        totalEscrowed -= amount;
        delivery.status = RequestStatus.Refunded;
        _decreaseLockedEscrow(
            delivery.shipper,
            amount,
            remainingBeforeRefund == amount
        );

        cargoToken.safeTransfer(delivery.shipper, amount);
        emit RefundIssued(requestId, delivery.shipper, amount);
        _refundOperationalAllowance(requestId);
    }

    function _decreaseLockedEscrow(
        address shipper,
        uint256 amount,
        bool requestSettled
    ) private {
        LockedEscrow storage lockedEscrow = lockedEscrowByShipper[shipper];
        lockedEscrow.totalLocked -= amount;
        if (requestSettled) {
            lockedEscrow.activeRequestCount -= 1;
        }
    }

    function _isRefundable(
        DeliveryRequest storage delivery,
        uint256 remaining
    ) private view returns (bool) {
        if (remaining == 0) {
            return false;
        }

        if (delivery.status == RequestStatus.Cancelled || delivery.status == RequestStatus.Expired) {
            return true;
        }

        return (
            delivery.status == RequestStatus.Funded ||
            delivery.status == RequestStatus.InProgress
        ) &&
            block.timestamp > delivery.deadline;
    }

    function _allMilestonesPaid(uint256 requestId) private view returns (bool) {
        uint256[] storage executionOrder = milestoneExecutionOrder[requestId];
        for (uint256 i = 0; i < executionOrder.length; i++) {
            if (
                requestMilestones[requestId][executionOrder[i]].status !=
                MilestoneStatus.Paid
            ) {
                return false;
            }
        }
        return executionOrder.length > 0;
    }

    function _removeOpenRequestId(uint256 requestId) private {
        for (uint256 i = 0; i < openRequestIds.length; i++) {
            if (openRequestIds[i] == requestId) {
                openRequestIds[i] = openRequestIds[openRequestIds.length - 1];
                openRequestIds.pop();
                return;
            }
        }
    }

    function _sliceIds(
        uint256[] storage ids,
        uint256 offset,
        uint256 limit
    ) private view returns (uint256[] memory) {
        if (offset >= ids.length || limit == 0) {
            return new uint256[](0);
        }

        uint256 end = offset + limit;
        if (end > ids.length) {
            end = ids.length;
        }

        uint256[] memory result = new uint256[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = ids[i];
        }
        return result;
    }

    receive() external payable {
        revert("CARGO payments only");
    }

    fallback() external payable {
        revert("CARGO payments only");
    }
}
