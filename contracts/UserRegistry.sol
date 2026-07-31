// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title CargoChain user registry
/// @notice Stores a lightweight public profile for each registered wallet.
/// @dev Registration is identity-only. CargoChain intentionally does not assign roles.
contract UserRegistry {
    uint256 public constant MAX_DISPLAY_NAME_BYTES = 64;

    struct User {
        address userAddress;
        string displayName;
        uint256 registeredAt;
        bool isRegistered;
    }

    mapping(address => User) private users;

    event UserRegistered(
        address indexed user,
        string displayName,
        uint256 registeredAt
    );
    event DisplayNameUpdated(
        address indexed user,
        string oldDisplayName,
        string newDisplayName
    );

    /// @notice Register the caller once with a trimmed display name.
    function registerUser(string calldata displayName) external {
        require(!users[msg.sender].isRegistered, "user already registered");

        string memory trimmedName = _validateAndTrim(displayName);
        uint256 registeredAt = block.timestamp;
        users[msg.sender] = User({
            userAddress: msg.sender,
            displayName: trimmedName,
            registeredAt: registeredAt,
            isRegistered: true
        });

        emit UserRegistered(msg.sender, trimmedName, registeredAt);
    }

    /// @notice Replace the caller's display name while retaining registration time.
    function updateDisplayName(string calldata displayName) external {
        User storage user = users[msg.sender];
        require(user.isRegistered, "user is not registered");

        string memory trimmedName = _validateAndTrim(displayName);
        string memory oldDisplayName = user.displayName;
        user.displayName = trimmedName;

        emit DisplayNameUpdated(msg.sender, oldDisplayName, trimmedName);
    }

    /// @notice Return whether an address has registered.
    function isRegistered(address user) external view returns (bool) {
        return users[user].isRegistered;
    }

    /// @notice Return a user's profile, or an empty profile for an unregistered address.
    function getUser(address user) external view returns (User memory) {
        return users[user];
    }

    function _validateAndTrim(string calldata displayName)
        private
        pure
        returns (string memory)
    {
        bytes calldata value = bytes(displayName);
        uint256 start = 0;
        uint256 end = value.length;

        while (start < end && _isAsciiWhitespace(uint8(value[start]))) {
            start++;
        }
        while (end > start && _isAsciiWhitespace(uint8(value[end - 1]))) {
            end--;
        }

        uint256 trimmedLength = end - start;
        require(trimmedLength > 0, "display name required");
        require(trimmedLength <= MAX_DISPLAY_NAME_BYTES, "display name exceeds 64 bytes");

        bytes memory trimmed = new bytes(trimmedLength);
        for (uint256 i = 0; i < trimmedLength; i++) {
            trimmed[i] = value[start + i];
        }
        return string(trimmed);
    }

    function _isAsciiWhitespace(uint8 character) private pure returns (bool) {
        return character == 0x20 || (character >= 0x09 && character <= 0x0d);
    }
}
