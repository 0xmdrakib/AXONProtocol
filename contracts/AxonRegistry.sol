// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IFactoryOwner {
    function owner() external view returns (address);
    function vaultOfAgent(bytes32 agentId) external view returns (address);
}

interface IVaultOwner {
    function owner() external view returns (address);
}

/// @title AxonRegistry
/// @notice A non-custodial, append-only attribution registry for official AXON deployments.
/// @dev The registry never owns or controls a user factory or vault. Users register their
///      own contracts, and future activity can be attributed by following the emitted links.
contract AxonRegistry {
    struct DeploymentRecord {
        bytes32 deploymentId;
        address deployer;
        address factory;
        uint256 chainId;
        string version;
        uint64 registeredAt;
        bool active;
    }

    address public immutable platform;

    mapping(address factory => DeploymentRecord deployment) public deployments;
    mapping(address deployer => address[] factories) private _factoriesByDeployer;
    mapping(address vault => address factory) public factoryOfVault;

    error ZeroAddress();
    error FactoryAlreadyRegistered();
    error FactoryOwnerRequired();
    error UnknownFactory();
    error VaultAlreadyAttributed();
    error InvalidVault();
    error DeploymentOwnerRequired();

    event PlatformInitialized(address indexed platform);
    event DeploymentRegistered(
        bytes32 indexed deploymentId,
        address indexed deployer,
        address indexed factory,
        uint256 chainId,
        string version,
        uint64 registeredAt
    );
    event VaultAttributed(
        bytes32 indexed deploymentId,
        address indexed deployer,
        address indexed factory,
        address vault,
        bytes32 agentId
    );

    constructor() {
        platform = msg.sender;
        emit PlatformInitialized(msg.sender);
    }

    /// @notice Register a factory whose owner is the caller.
    /// @dev The caller pays for this transaction and remains the factory owner.
    function registerDeployment(address factory, string calldata version) external returns (bytes32 deploymentId) {
        if (factory == address(0)) revert ZeroAddress();

        DeploymentRecord storage existing = deployments[factory];
        if (existing.deploymentId != bytes32(0)) revert FactoryAlreadyRegistered();

        address factoryOwner = IFactoryOwner(factory).owner();
        if (factoryOwner != msg.sender) revert FactoryOwnerRequired();

        deploymentId = keccak256(abi.encode(block.chainid, msg.sender, factory));
        deployments[factory] = DeploymentRecord({
            deploymentId: deploymentId,
            deployer: msg.sender,
            factory: factory,
            chainId: block.chainid,
            version: version,
            registeredAt: uint64(block.timestamp),
            active: true
        });
        _factoriesByDeployer[msg.sender].push(factory);

        emit DeploymentRegistered(deploymentId, msg.sender, factory, block.chainid, version, uint64(block.timestamp));
    }

    /// @notice Link a user-owned vault to its registered AXON factory.
    /// @dev The factory and vault ownership are both checked before attribution.
    function registerVault(address factory, bytes32 agentId, address vault) external {
        if (factory == address(0) || vault == address(0)) revert ZeroAddress();

        DeploymentRecord storage deployment = deployments[factory];
        if (deployment.deploymentId == bytes32(0)) revert UnknownFactory();
        if (deployment.deployer != msg.sender) revert DeploymentOwnerRequired();
        if (factoryOfVault[vault] != address(0)) revert VaultAlreadyAttributed();
        if (IFactoryOwner(factory).vaultOfAgent(agentId) != vault) revert InvalidVault();
        if (IVaultOwner(vault).owner() != msg.sender) revert InvalidVault();

        factoryOfVault[vault] = factory;
        emit VaultAttributed(deployment.deploymentId, msg.sender, factory, vault, agentId);
    }

    function factoriesByDeployer(address deployer) external view returns (address[] memory) {
        return _factoriesByDeployer[deployer];
    }
}
