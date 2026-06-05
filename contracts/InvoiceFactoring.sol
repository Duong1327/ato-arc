// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Factoring {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

interface IATOEnterpriseVault {
    struct Milestone {
        string name;
        uint256 allocatedERC20;
        uint256 spentERC20;
        uint256 timeDeadline;
        bool isActive;
        bool exists;
        address jobContractAddress;
        address provider;
        address evaluator;
        address token;
    }
    
    function milestones(uint256 id) external view returns (
        string memory name,
        uint256 allocatedERC20,
        uint256 spentERC20,
        uint256 timeDeadline,
        bool isActive,
        bool exists,
        address jobContractAddress,
        address provider,
        address evaluator,
        address token
    );
    
    function registerFactoringPurchaser(uint256 milestoneId, address purchaser) external;
    function isAgent(address account) external view returns (bool);
    function isOwner(address account) external view returns (bool);
}

/**
 * @title InvoiceFactoring
 * @notice Factoring facility enabling suppliers to discount milestone receivables in exchange for early payouts.
 */
contract InvoiceFactoring {

    struct FactoringOffer {
        uint256 milestoneId;
        address supplier;
        uint256 totalAmount;
        uint256 discountRate; // in basis points (e.g. 500 = 5%)
        uint256 netPayout;
        address purchaser;
        bool isSold;
        bool isApproved;
        bool exists;
    }

    address public vaultAddress;
    address public usdcTokenAddress;

    mapping(uint256 => FactoringOffer) public offers;

    event FactoringOfferProposed(uint256 indexed milestoneId, address indexed supplier, uint256 totalAmount, uint256 discountRate, uint256 netPayout);
    event FactoringOfferEvaluated(uint256 indexed milestoneId, bool approved);
    event FactoringClaimPurchased(uint256 indexed milestoneId, address indexed purchaser, uint256 netPayout);

    error MilestoneDoesNotExist();
    error NotTheProvider();
    error OfferAlreadyExists();
    error OfferDoesNotExist();
    error AlreadySold();
    error NotApproved();
    error Unauthorized();
    error TransferFailed();

    modifier onlyAgentOrOwner() {
        if (!IATOEnterpriseVault(vaultAddress).isAgent(msg.sender) && !IATOEnterpriseVault(vaultAddress).isOwner(msg.sender)) {
            revert Unauthorized();
        }
        _;
    }

    constructor(address _vaultAddress, address _usdcTokenAddress) {
        vaultAddress = _vaultAddress;
        usdcTokenAddress = _usdcTokenAddress;
    }

    /**
     * @notice Propose a milestone discount offer. Only the provider (supplier) of the milestone can call this.
     */
    function proposeFactoringOffer(uint256 milestoneId, uint256 discountRate) external {
        if (offers[milestoneId].exists) revert OfferAlreadyExists();
        if (discountRate > 10000) revert Unauthorized(); // Cannot discount more than 100%

        (
            ,
            uint256 allocatedERC20,
            ,
            ,
            ,
            bool exists,
            ,
            address provider,
            ,
            
        ) = IATOEnterpriseVault(vaultAddress).milestones(milestoneId);

        if (!exists) revert MilestoneDoesNotExist();
        if (provider != msg.sender) revert NotTheProvider();

        uint256 netPayout = (allocatedERC20 * (10000 - discountRate)) / 10000;

        offers[milestoneId] = FactoringOffer({
            milestoneId: milestoneId,
            supplier: msg.sender,
            totalAmount: allocatedERC20,
            discountRate: discountRate,
            netPayout: netPayout,
            purchaser: address(0),
            isSold: false,
            isApproved: false,
            exists: true
        });

        emit FactoringOfferProposed(milestoneId, msg.sender, allocatedERC20, discountRate, netPayout);
    }

    /**
     * @notice Evaluate a factoring request and approve/reject terms.
     */
    function evaluateFactoringOffer(uint256 milestoneId, bool approved) external onlyAgentOrOwner {
        FactoringOffer storage offer = offers[milestoneId];
        if (!offer.exists) revert OfferDoesNotExist();
        if (offer.isSold) revert AlreadySold();

        offer.isApproved = approved;
        emit FactoringOfferEvaluated(milestoneId, approved);
    }

    /**
     * @notice Purchase a milestone claim by paying the supplier their discounted receivable net payout.
     */
    function buyMilestoneClaim(uint256 milestoneId) external {
        FactoringOffer storage offer = offers[milestoneId];
        if (!offer.exists) revert OfferDoesNotExist();
        if (!offer.isApproved) revert NotApproved();
        if (offer.isSold) revert AlreadySold();

        offer.isSold = true;
        offer.purchaser = msg.sender;

        // Pull net payout from purchaser to supplier
        bool success = IERC20Factoring(usdcTokenAddress).transferFrom(msg.sender, offer.supplier, offer.netPayout);
        if (!success) revert TransferFailed();

        // Register the purchaser in the Enterprise Vault
        IATOEnterpriseVault(vaultAddress).registerFactoringPurchaser(milestoneId, msg.sender);

        emit FactoringClaimPurchased(milestoneId, msg.sender, offer.netPayout);
    }
}
