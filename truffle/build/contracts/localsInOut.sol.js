var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, instance, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var decodeLogs = function(logs) {
            return logs.map(function(log) {
              var logABI = C.events[log.topics[0]];

              if (logABI == null) {
                return null;
              }

              var decoder = new SolidityEvent(null, logABI, instance.address);
              return decoder.decode(log);
            }).filter(function(log) {
              return log != null;
            });
          };

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  // If they've opted into next gen, return more information.
                  if (C.next_gen == true) {
                    return accept({
                      tx: tx,
                      receipt: receipt,
                      logs: decodeLogs(receipt.logs)
                    });
                  } else {
                    return accept(tx);
                  }
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("localsInOut error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("localsInOut error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("localsInOut contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of localsInOut: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to localsInOut.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: localsInOut not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "default": {
    "abi": [
      {
        "constant": false,
        "inputs": [
          {
            "name": "offerNumber",
            "type": "uint256"
          }
        ],
        "name": "claim",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "kill",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_claimer",
            "type": "address"
          },
          {
            "name": "_amount",
            "type": "uint256"
          },
          {
            "name": "_descriptionipfs",
            "type": "string"
          },
          {
            "name": "_validityStart",
            "type": "uint256"
          },
          {
            "name": "_duration",
            "type": "uint256"
          }
        ],
        "name": "newOffer",
        "outputs": [
          {
            "name": "offerID",
            "type": "uint256"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "offerNumber",
            "type": "uint256"
          },
          {
            "name": "transactionBytecode",
            "type": "bytes"
          }
        ],
        "name": "executeOffer",
        "outputs": [
          {
            "name": "result",
            "type": "int256"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "name": "offers",
        "outputs": [
          {
            "name": "creator",
            "type": "address"
          },
          {
            "name": "claimer",
            "type": "address"
          },
          {
            "name": "amount",
            "type": "uint256"
          },
          {
            "name": "descriptionipfs",
            "type": "string"
          },
          {
            "name": "validityStart",
            "type": "uint256"
          },
          {
            "name": "validityEnd",
            "type": "uint256"
          },
          {
            "name": "status",
            "type": "uint256"
          },
          {
            "name": "geoMapping",
            "type": "uint256"
          },
          {
            "name": "duration",
            "type": "uint256"
          },
          {
            "name": "numberOfConfirmations",
            "type": "uint256"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "offerNumber",
            "type": "uint256"
          },
          {
            "name": "supportsConfirmation",
            "type": "bool"
          }
        ],
        "name": "confirm",
        "outputs": [
          {
            "name": "confirmID",
            "type": "uint256"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "owner",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "numOffers",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "newOwner",
            "type": "address"
          }
        ],
        "name": "transferOwnership",
        "outputs": [],
        "type": "function"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "proposalID",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "recipient",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "description",
            "type": "string"
          }
        ],
        "name": "OfferAdded",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "offerNumber",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "supportsProposal",
            "type": "bool"
          },
          {
            "indexed": false,
            "name": "confirmator",
            "type": "address"
          }
        ],
        "name": "Confirmed",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x606060405260008054600160a060020a03191633179055610993806100246000396000f3606060405236156100775760e060020a6000350463379607f5811461007957806341c0e1b5146100cc5780635552a483146100f5578063606d0d14146101805780638a72ea6a146101e55780638c55284a1461037c5780638da5cb5b146103d9578063cc6bee54146103eb578063f2fde38b146103f4575b005b61007760043560006001600050828154811015610002575090527fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf7600c909102018054600160a060020a03191633179055565b610077600054600160a060020a0390811633909116141561052157600054600160a060020a0316ff5b604080516020604435600481810135601f81018490048402850184019095528484526104159481359460248035959394606494929391019181908401838280828437509496505093359350506084359150506001805480820180835560009283929182801582901161052357600c0281600c0283600052602060002091820191016105239190610644565b60408051602060248035600481810135601f810185900485028601850190965285855261041595813595919460449492939092019181908401838280828437509496505050505050506000600060016000508481548110156100025750905292915050565b6104276004356001805482908110156100025750600052600c027fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf68101547fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf78201547fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf88301547fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cfa8401547fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cfb8501547fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cfc8601547fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cfd8701547fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cfe8801547fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cff890154600160a060020a0398891699979098169795967fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf901958a565b6104156004356024356000600060016000508481548110156100025790600052602060002090600c020160005033600160a060020a03166000908152600b8201602052604090205490915060ff1615156001141561086757610002565b610504600054600160a060020a031681565b61041560025481565b61007760043560005433600160a060020a0390811691161461097e57610002565b60408051918252519081900360200190f35b60408051600160a060020a038c811682528b1660208201529081018990526080810187905260a0810186905260c0810185905260e081018490526101008181018490526101208201839052610140606083018181528a54600260018216159094026000190116929092049083018190526101608301908a9080156104ec5780601f106104c1576101008083540402835291602001916104ec565b820191906000526020600020905b8154815290600101906020018083116104cf57829003601f168201915b50509b50505050505050505050505060405180910390f35b60408051600160a060020a03929092168252519081900360200190f35b565b5050600180549294509184915081101561000257506000818152600c84027fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf681018054600160a060020a0319908116331782557fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf7830180549091168c1790557fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf882018a905588517fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf990920180548185526020948590209296509094600290821615610100026000190190911604601f9081018490048201938a019083901061073d57805160ff19168380011785555b5061076d929150610725565b5050600c015b80821115610739578054600160a060020a031990811682556001828101805490921690915560006002838101829055600384018054838255929390929081161561010002600019011604601f81901061070b57505b506000600483018190556005830181905560068301819055600783018190556008830181905560098301819055600a83018054828255908252602090912061063e918101905b8082111561073957805474ffffffffffffffffffffffffffffffffffffffffff191681556001016106df565b601f01602090049060005260206000209081019061069991905b808211156107395760008155600101610725565b5090565b82800160010185558215610632579182015b8281111561063257825182600050559160200191906001019061074f565b505083816004016000508190555082603c024201816005016000508190555060008160060160005081905550600081600901600050819055507f1c77556bff526e892c271cf4495a383a48d3c41c6bb0b76352e775b6f2398ee5828888886040518085815260200184600160a060020a03168152602001838152602001806020018281038252838181518152602001915080519060200190808383829060006004602084601f0104600302600f01f150905090810190601f1680156108465780820380516001836020036101000a031916815260200191505b509550505050505060405180910390a1600182016002555095945050505050565b600a8101805460018101808355909190828015829011610898576000838152602090206108989181019083016106df565b505060408051808201909152858152336020820152600a8401805493955090929091508490811015610002579060005260206000209001600050815181546020938401516101000260ff1991821690921774ffffffffffffffffffffffffffffffffffffffff0019169190911790915533600160a060020a03166000818152600b850184526040908190208054939093166001908117909355918501600985015581518781528615159381019390935282820152517fb09cf54a08e6ea630882d18a37af310400ae3caba13c0b9209f6b5ac5d63aa2b9181900360600190a15092915050565b60008054600160a060020a031916821790555056",
    "events": {
      "0x1c77556bff526e892c271cf4495a383a48d3c41c6bb0b76352e775b6f2398ee5": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "proposalID",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "recipient",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "description",
            "type": "string"
          }
        ],
        "name": "OfferAdded",
        "type": "event"
      },
      "0xb09cf54a08e6ea630882d18a37af310400ae3caba13c0b9209f6b5ac5d63aa2b": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "offerNumber",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "supportsProposal",
            "type": "bool"
          },
          {
            "indexed": false,
            "name": "confirmator",
            "type": "address"
          }
        ],
        "name": "Confirmed",
        "type": "event"
      }
    },
    "updated_at": 1474498156249,
    "links": {},
    "address": "0x05f809d54a32b54e025124c24680f7e8e8b78f54"
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};
    this.events          = this.prototype.events          = network.events || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "function") {
      var contract = name;

      if (contract.address == null) {
        throw new Error("Cannot link contract without an address.");
      }

      Contract.link(contract.contract_name, contract.address);

      // Merge events so this contract knows about library's events
      Object.keys(contract.events).forEach(function(topic) {
        Contract.events[topic] = contract.events[topic];
      });

      return;
    }

    if (typeof name == "object") {
      var obj = name;
      Object.keys(obj).forEach(function(name) {
        var a = obj[name];
        Contract.link(name, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "localsInOut";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.localsInOut = Contract;
  }
})();