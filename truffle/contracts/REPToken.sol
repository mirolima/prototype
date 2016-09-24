import "./owned.sol";

contract REPToken is owned {
    /* Public variables of the token */
    string public name;
    string public symbol;
    uint256 public totalSupply;
    //address public owner;
    mapping (address => bool) public whitelist;

    /* This creates an array with all balances */
    mapping (address => uint256) public balanceOf;
   
    /* This generates a public event on the blockchain that will notify clients */
    event Minted(address target, uint256 amount);

    /* Initializes contract with initial supply tokens to the creator of the contract */
    function REPToken(
        string tokenName,
        string tokenSymbol
        ) {                
        name = tokenName;                                   // Set the name for display purposes
        symbol = tokenSymbol;                               // Set the symbol for display purpose
        whitelist[msg.sender] = true;
    }

    function mintToken(address target, uint256 mintedAmount) {
        if(!whitelist[msg.sender]) throw;
        if(target == 0x0) throw;    // avoid minting REP to empty address
        balanceOf[target] += mintedAmount;
        totalSupply += mintedAmount;
        Minted(target,mintedAmount);
    }

    function addToWhitelist(address _whitelistaddr) onlyOwner {
        whitelist[_whitelistaddr] = true;
    }

    function removeFromWhitelist(address _whitelistaddr) onlyOwner {
        whitelist[_whitelistaddr] = false;
    }

    /* This unnamed function is called whenever someone tries to send ether to it */
    function () {
        throw;     // Prevents accidental sending of ether
    }

    /* Kill function */
    function kill() onlyOwner { suicide(owner); }
}
