// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @dev Narrow escrow surface used to validate rating eligibility.
interface IDeliveryEscrowReputation {
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
}

/// @title CargoChain carrier reputation registry
/// @notice Stores one immutable shipper rating for each completed delivery.
/// Objective delivery performance remains authoritative in DeliveryEscrow.
contract ReputationRegistry {
    uint8 public constant MIN_SCORE = 1;
    uint8 public constant MAX_SCORE = 5;
    uint8 public constant TAG_COUNT = 8;
    uint8 public constant MAX_TAGS_PER_RATING = 3;
    uint16 public constant ALLOWED_TAG_MASK = 0x00ff;

    struct Rating {
        address shipper;
        address carrier;
        uint64 createdAt;
        uint16 tagMask;
        uint8 score;
    }

    IDeliveryEscrowReputation public immutable deliveryEscrow;

    mapping(uint256 => Rating) private ratings;
    mapping(address => uint256) private ratingCounts;
    mapping(address => uint256) private ratingScoreTotals;
    mapping(address => uint256[TAG_COUNT]) private carrierTagCounts;

    event CarrierRated(
        uint256 indexed requestId,
        address indexed shipper,
        address indexed carrier,
        uint8 score,
        uint16 tagMask,
        uint256 createdAt
    );

    constructor(address deliveryEscrowAddress) {
        require(deliveryEscrowAddress != address(0), "escrow address required");
        deliveryEscrow = IDeliveryEscrowReputation(deliveryEscrowAddress);
    }

    function submitCarrierRating(
        uint256 requestId,
        uint8 score,
        uint16 tagMask
    ) external {
        require(ratings[requestId].createdAt == 0, "request already rated");
        require(score >= MIN_SCORE && score <= MAX_SCORE, "score must be 1 to 5");
        require((tagMask | ALLOWED_TAG_MASK) == ALLOWED_TAG_MASK, "unknown feedback tag");
        require(_countSelectedTags(tagMask) <= MAX_TAGS_PER_RATING, "too many feedback tags");

        (
            address shipper,
            address carrier,
            IDeliveryEscrowReputation.RequestStatus status,
            ,

        ) = deliveryEscrow.getLifecycleSnapshot(requestId);

        require(status == IDeliveryEscrowReputation.RequestStatus.Completed, "request is not completed");
        require(msg.sender == shipper, "caller is not request shipper");
        require(carrier != address(0), "request has no carrier");

        uint64 createdAt = uint64(block.timestamp);
        ratings[requestId] = Rating({
            shipper: shipper,
            carrier: carrier,
            createdAt: createdAt,
            tagMask: tagMask,
            score: score
        });
        ratingCounts[carrier] += 1;
        ratingScoreTotals[carrier] += score;

        for (uint8 tagIndex = 0; tagIndex < TAG_COUNT; tagIndex++) {
            if ((tagMask & (uint16(1) << tagIndex)) != 0) {
                carrierTagCounts[carrier][tagIndex] += 1;
            }
        }

        emit CarrierRated(requestId, shipper, carrier, score, tagMask, createdAt);
    }

    function hasRated(uint256 requestId) external view returns (bool) {
        return ratings[requestId].createdAt != 0;
    }

    function getRating(uint256 requestId) external view returns (Rating memory) {
        return ratings[requestId];
    }

    function getCarrierRatingSummary(address carrier)
        external
        view
        returns (uint256 ratingCount, uint256 totalScore)
    {
        return (ratingCounts[carrier], ratingScoreTotals[carrier]);
    }

    function getCarrierTagCounts(address carrier)
        external
        view
        returns (uint256[] memory counts)
    {
        counts = new uint256[](TAG_COUNT);
        for (uint8 tagIndex = 0; tagIndex < TAG_COUNT; tagIndex++) {
            counts[tagIndex] = carrierTagCounts[carrier][tagIndex];
        }
    }

    function _countSelectedTags(uint16 tagMask) private pure returns (uint8 count) {
        while (tagMask != 0) {
            count += uint8(tagMask & 1);
            tagMask >>= 1;
        }
    }
}
