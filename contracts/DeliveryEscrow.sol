// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title CargoChain MVP delivery escrow
/// @notice Single-contract MVP for request creation, carrier milestone proposal,
/// escrow funding, proof submission, verification, payout, and unpaid refunds.
contract DeliveryEscrow {
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
    }

    uint256 private nextRequestId = 1;

    mapping(uint256 => DeliveryRequest) private requests;
    mapping(uint256 => Item[]) private requestItems;
    mapping(uint256 => Milestone[]) private requestMilestones;
    uint256[] private allRequestIds;
    uint256[] private openRequestIds;

    event RequestCreated(uint256 indexed requestId, address indexed shipper, uint256 proposedAmount);
    event MilestonePlanProposed(uint256 indexed requestId, address indexed carrier);
    event MilestonePlanRejected(uint256 indexed requestId, address indexed carrier);
    event EscrowFunded(uint256 indexed requestId, uint256 amount);
    event ProofSubmitted(uint256 indexed requestId, uint256 indexed milestoneId);
    event MilestoneVerified(uint256 indexed requestId, uint256 indexed milestoneId, bool approved);
    event MilestonePaid(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        address indexed carrier,
        uint256 amount
    );
    event MilestoneRejected(uint256 indexed requestId, uint256 indexed milestoneId, string reason);
    event RequestCancelled(uint256 indexed requestId, address indexed shipper);
    event RefundIssued(uint256 indexed requestId, address indexed shipper, uint256 amount);

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
    ) external returns (uint256 requestId) {
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
    ) external requestExists(requestId) {
        DeliveryRequest storage delivery = requests[requestId];
        require(delivery.status == RequestStatus.Open, "request is not open");
        require(msg.sender != delivery.shipper, "shipper cannot be carrier");
        require(milestones.length > 0, "at least one milestone required");

        uint256 totalPercentage = 0;
        for (uint256 i = 0; i < milestones.length; i++) {
            require(bytes(milestones[i].name).length > 0, "milestone name required");
            require(milestones[i].payoutPercentage > 0, "payout must be positive");
            totalPercentage += milestones[i].payoutPercentage;
        }
        require(totalPercentage == 100, "payout percentages must equal 100");

        delivery.carrier = msg.sender;
        delivery.status = RequestStatus.PendingApproval;
        _removeOpenRequestId(requestId);

        for (uint256 i = 0; i < milestones.length; i++) {
            requestMilestones[requestId].push();
            Milestone storage milestone = requestMilestones[requestId][i];
            milestone.name = milestones[i].name;
            milestone.payoutPercentage = milestones[i].payoutPercentage;
            milestone.status = MilestoneStatus.Proposed;
        }

        emit MilestonePlanProposed(requestId, msg.sender);
    }

    function rejectMilestoneProposal(uint256 requestId)
        external
        requestExists(requestId)
        onlyShipper(requestId)
    {
        DeliveryRequest storage delivery = requests[requestId];
        require(delivery.status == RequestStatus.PendingApproval, "request is not awaiting approval");

        address rejectedCarrier = delivery.carrier;
        delivery.carrier = address(0);
        delivery.status = RequestStatus.Open;
        delete requestMilestones[requestId];
        openRequestIds.push(requestId);

        emit MilestonePlanRejected(requestId, rejectedCarrier);
    }

    function approveAndFund(uint256 requestId)
        external
        payable
        requestExists(requestId)
        onlyShipper(requestId)
    {
        DeliveryRequest storage delivery = requests[requestId];
        require(delivery.status == RequestStatus.PendingApproval, "request is not awaiting approval");
        require(msg.value == delivery.proposedAmount, "funding must match proposed amount");

        Milestone[] storage milestones = requestMilestones[requestId];
        require(milestones.length > 0, "no milestones proposed");

        delivery.totalAmount = msg.value;
        delivery.status = RequestStatus.Funded;

        uint256 allocated = 0;
        for (uint256 i = 0; i < milestones.length; i++) {
            milestones[i].status = MilestoneStatus.PendingProof;
            if (i == milestones.length - 1) {
                milestones[i].payoutAmount = msg.value - allocated;
            } else {
                uint256 amount = (msg.value * milestones[i].payoutPercentage) / 100;
                milestones[i].payoutAmount = amount;
                allocated += amount;
            }
        }

        emit EscrowFunded(requestId, msg.value);
    }

    function submitProof(
        uint256 requestId,
        uint256 milestoneId,
        string[] calldata proofUris,
        string calldata remark
    ) external requestExists(requestId) onlyCarrier(requestId) {
        DeliveryRequest storage delivery = requests[requestId];
        require(
            delivery.status == RequestStatus.Funded || delivery.status == RequestStatus.InProgress,
            "request is not active"
        );
        require(proofUris.length > 0, "at least one proof uri required");
        require(milestoneId < requestMilestones[requestId].length, "milestone does not exist");

        Milestone storage milestone = requestMilestones[requestId][milestoneId];
        require(
            milestone.status == MilestoneStatus.PendingProof || milestone.status == MilestoneStatus.Rejected,
            "milestone is not waiting for proof"
        );

        delete milestone.proofUris;
        for (uint256 i = 0; i < proofUris.length; i++) {
            require(bytes(proofUris[i]).length > 0, "proof uri required");
            milestone.proofUris.push(proofUris[i]);
        }

        milestone.remark = remark;
        milestone.rejectionReason = "";
        milestone.status = MilestoneStatus.Submitted;
        milestone.submittedAt = block.timestamp;
        delivery.status = RequestStatus.InProgress;

        emit ProofSubmitted(requestId, milestoneId);
    }

    function verifyMilestone(
        uint256 requestId,
        uint256 milestoneId,
        bool approve,
        string calldata rejectionReason
    ) external requestExists(requestId) onlyShipper(requestId) {
        require(milestoneId < requestMilestones[requestId].length, "milestone does not exist");

        Milestone storage milestone = requestMilestones[requestId][milestoneId];
        require(milestone.status == MilestoneStatus.Submitted, "milestone is not submitted");

        if (!approve) {
            require(bytes(rejectionReason).length > 0, "rejection reason required");
            milestone.status = MilestoneStatus.Rejected;
            milestone.rejectionReason = rejectionReason;
            emit MilestoneVerified(requestId, milestoneId, false);
            emit MilestoneRejected(requestId, milestoneId, rejectionReason);
            return;
        }

        milestone.status = MilestoneStatus.Verified;
        milestone.verifiedAt = block.timestamp;
        emit MilestoneVerified(requestId, milestoneId, true);

        _releaseMilestonePayment(requestId, milestoneId);
    }

    function cancelRequest(uint256 requestId)
        external
        requestExists(requestId)
        onlyShipper(requestId)
    {
        DeliveryRequest storage delivery = requests[requestId];
        require(
            delivery.status != RequestStatus.Completed &&
                delivery.status != RequestStatus.Cancelled &&
                delivery.status != RequestStatus.Refunded,
            "request cannot be cancelled"
        );

        if (delivery.status == RequestStatus.Open) {
            _removeOpenRequestId(requestId);
        }

        delivery.status = RequestStatus.Cancelled;
        emit RequestCancelled(requestId, msg.sender);

        uint256 remaining = escrowBalance(requestId);
        if (remaining > 0) {
            _refund(requestId, remaining);
        }
    }

    function refundRemaining(uint256 requestId)
        external
        requestExists(requestId)
        onlyShipper(requestId)
    {
        DeliveryRequest storage delivery = requests[requestId];
        require(delivery.status != RequestStatus.Completed, "completed request cannot be refunded");
        require(delivery.status != RequestStatus.Refunded, "request already refunded");

        if (delivery.status != RequestStatus.Cancelled) {
            require(block.timestamp > delivery.deadline, "request is not cancelled or expired");
            delivery.status = RequestStatus.Expired;
        }

        uint256 remaining = escrowBalance(requestId);
        require(remaining > 0, "no escrow remaining");
        _refund(requestId, remaining);
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
        return requestMilestones[requestId];
    }

    function getMilestone(uint256 requestId, uint256 milestoneId)
        external
        view
        requestExists(requestId)
        returns (Milestone memory)
    {
        require(milestoneId < requestMilestones[requestId].length, "milestone does not exist");
        return requestMilestones[requestId][milestoneId];
    }

    function getProofUris(uint256 requestId, uint256 milestoneId)
        external
        view
        requestExists(requestId)
        returns (string[] memory)
    {
        require(milestoneId < requestMilestones[requestId].length, "milestone does not exist");
        return requestMilestones[requestId][milestoneId].proofUris;
    }

    function escrowBalance(uint256 requestId) public view requestExists(requestId) returns (uint256) {
        DeliveryRequest storage delivery = requests[requestId];
        return delivery.totalAmount - delivery.releasedAmount;
    }

    function _releaseMilestonePayment(uint256 requestId, uint256 milestoneId) private {
        DeliveryRequest storage delivery = requests[requestId];
        Milestone storage milestone = requestMilestones[requestId][milestoneId];
        require(milestone.status == MilestoneStatus.Verified, "milestone is not verified");
        require(milestone.payoutAmount > 0, "milestone has no payout");
        require(escrowBalance(requestId) >= milestone.payoutAmount, "insufficient escrow");

        uint256 amount = milestone.payoutAmount;
        milestone.status = MilestoneStatus.Paid;
        delivery.releasedAmount += amount;

        if (_allMilestonesPaid(requestId)) {
            delivery.status = RequestStatus.Completed;
        }

        (bool ok, ) = payable(delivery.carrier).call{value: amount}("");
        require(ok, "carrier payment failed");
        emit MilestonePaid(requestId, milestoneId, delivery.carrier, amount);
    }

    function _refund(uint256 requestId, uint256 amount) private {
        DeliveryRequest storage delivery = requests[requestId];
        delivery.releasedAmount += amount;
        delivery.status = RequestStatus.Refunded;

        (bool ok, ) = payable(delivery.shipper).call{value: amount}("");
        require(ok, "refund failed");
        emit RefundIssued(requestId, delivery.shipper, amount);
    }

    function _allMilestonesPaid(uint256 requestId) private view returns (bool) {
        Milestone[] storage milestones = requestMilestones[requestId];
        for (uint256 i = 0; i < milestones.length; i++) {
            if (milestones[i].status != MilestoneStatus.Paid) {
                return false;
            }
        }
        return milestones.length > 0;
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
}
