import React from 'react'
import '../../assets/stylesheets/application.css';
import { deployContract, getWeb3, checkWeb3, getNetworkVersion } from '../../utils/blockchainHelpers'
import { setLastCrowdsaleRecursive, addWhiteListRecursive, setFinalizeAgentRecursive, setMintAgentRecursive, setReleaseAgentRecursive, updateJoinedCrowdsalesRecursive, transferOwnership, setReservedTokensListMultiple, setLastCrowdsale } from './utils'
import {download, getDownloadName, handleContractsForFile, handlerForFile, handleCrowdsaleForFile, handlePricingStrategyForFile, handleFinalizeAgentForFile, handleConstantForFile, scrollToBottom } from './utils'
import { noMetaMaskAlert, noContractDataAlert } from '../../utils/alerts'
import { FILE_CONTENTS, DOWNLOAD_NAME, DOWNLOAD_TYPE, CONTRACT_TYPES, TOAST } from '../../utils/constants'
import { toFixed, floorToDecimals, toast } from '../../utils/utils'
import { getEncodedABIClientSide } from '../../utils/microservices'
import { stepTwo } from '../stepTwo'
import { StepNavigation } from '../Common/StepNavigation'
import { DisplayField } from '../Common/DisplayField'
import { DisplayTextArea } from '../Common/DisplayTextArea'
import { Loader } from '../Common/Loader'
import { NAVIGATION_STEPS, TRUNC_TO_DECIMALS } from '../../utils/constants'
import { copy } from '../../utils/copy';
import { observer, inject } from 'mobx-react'
import { isObservableArray } from 'mobx'
import JSZip from 'jszip'
const { PUBLISH } = NAVIGATION_STEPS


@inject('contractStore', 'reservedTokenStore', 'tierStore', 'tokenStore', 'web3Store')
@observer export class stepFour extends stepTwo {
  constructor(props) {
    super(props);
    this.state = {
      contractDownloaded: false,
      loading: false
    }
  }

  contractDownloadSuccess = options => {
    this.setState({ contractDownloaded: true })
    toast.showToaster({ message: TOAST.MESSAGE.CONTRACT_DOWNLOAD_SUCCESS, options })
  }

  componentDidMount() {
    const { contractStore, web3Store, tierStore } = this.props
    const web3 = web3Store.web3
    scrollToBottom();
    copy('copy');
    checkWeb3(web3);
    switch (this.props.contractStore.contractType) {
      case CONTRACT_TYPES.whitelistwithcap: {
        if (!contractStore.safeMathLib) {
          this.hideLoader();
          return noContractDataAlert();
        }

        let newState = { ...this.state }
        newState.loading = true;
        this.setState(newState);
        let abiToken = contractStore && contractStore.token && contractStore.token.abi || []
        let addrToken = contractStore && contractStore.token && contractStore.token.addr || null
        let abiPricingStrategy = contractStore && contractStore.pricingStrategy && contractStore.pricingStrategy.abi || []

        setTimeout(() => {
          const web3 = web3Store.web3;
          let counter = 0;
          if (!addrToken) {
            getEncodedABIClientSide(web3, abiToken, [], 0, (ABIencoded) => {
              counter++;
              let cntrct = "token";
              contractStore.setContractProperty(cntrct, 'abiConstructor', ABIencoded)
              console.log(cntrct + " ABI encoded params constructor:");
              console.log(ABIencoded);
              if (counter == (tierStore.tiers.length + 1))
                this.deploySafeMathLibrary();
            });
          }
          for (let i = 0; i < tierStore.tiers.length; i++) {
            getEncodedABIClientSide(web3, abiPricingStrategy, [], i, (ABIencoded) => {
              counter++;
              let cntrct = "pricingStrategy";
              const newContract = contractStore[cntrct].abiConstructor.concat(ABIencoded)
              contractStore.setContractProperty(cntrct, 'abiConstructor', newContract);
              console.log(cntrct + " ABI encoded params constructor:");
              console.log(ABIencoded);
              if (counter == (tierStore.tiers.length + 1))
                this.deploySafeMathLibrary();
            });
          }
        });
      } break;
      default:
        break;
    }
  }

  hideLoader() {
    let newState = { ...this.state }
    newState.loading = false;
    this.setState(newState);
  }

  handleContentByParent(content, index = 0) {
    const { parent } = content

    switch (parent) {
      case 'crowdsale':
      case 'pricingStrategy':
      case 'finalizeAgent':
        return handlerForFile(content, this.props.contractStore[parent])
      case 'tierStore':
        index = 'walletAddress' === content.field ? 0 : index
        return handlerForFile(content, this.props[parent].tiers[index])
      case 'tokenStore':
        return handlerForFile(content, this.props[parent])
      case 'contracts':
        return handleContractsForFile(content, index, this.props.contractStore, this.props.tierStore)
      case 'none':
        return handleConstantForFile(content)
    }
  }

  downloadCrowdsaleInfo = () => {
    const zip = new JSZip()
    const { files } = FILE_CONTENTS
    const [NULL_FINALIZE_AGENT, FINALIZE_AGENT] = ['nullFinalizeAgent', 'finalizeAgent']
    const tiersCount = isObservableArray(this.props.tierStore.tiers) ? this.props.tierStore.tiers.length : 1
    const contractsKeys = tiersCount === 1 ? files.order.filter(c => c !== NULL_FINALIZE_AGENT) : files.order;
    const orderNumber = order => order.toString().padStart(3, '0');
    let prefix = 1

    contractsKeys.forEach(key => {
      if (this.props.contractStore.hasOwnProperty(key)) {
        const { txt, sol, name } = files[key]
        const { abiConstructor } = this.props.contractStore[key]
        let tiersCountPerContract = isObservableArray(abiConstructor) ? abiConstructor.length : 1

        if (tiersCount > 1 && [NULL_FINALIZE_AGENT, FINALIZE_AGENT].includes(key)) {
          tiersCountPerContract = NULL_FINALIZE_AGENT === key ? tiersCount - 1 : 1
        }

        for (let tier = 0; tier < tiersCountPerContract; tier++) {
          const suffix = tiersCountPerContract > 1 ? `_${tier + 1}` : ''
          const solFilename = `${orderNumber(prefix++)}_${name}${suffix}`
          const txtFilename = `${orderNumber(prefix++)}_${name}${suffix}`
          const tierNumber = FINALIZE_AGENT === key ? tiersCount - 1 : tier
          const commonHeader = FILE_CONTENTS.common.map(content => this.handleContentByParent(content, tierNumber))

          zip.file(
            `${solFilename}.sol`,
            this.handleContentByParent(sol)
          )
          zip.file(
            `${txtFilename}.txt`,
            commonHeader.concat(txt.map(content => this.handleContentByParent(content, tierNumber))).join('\n\n')
          )
        }
      }
    })

    zip.generateAsync({ type: DOWNLOAD_TYPE.blob })
      .then(content => {
        const tokenAddr = this.props.contractStore ? this.props.contractStore.token.addr : '';

        getDownloadName(tokenAddr)
          .then(downloadName => download({ zip: content, filename: downloadName }))
      })
  }

  deploySafeMathLibrary = () => {
    const { web3Store, contractStore } = this.props
    const web3 = web3Store.web3
    console.log("***Deploy safeMathLib contract***");
    if (!web3 || web3.eth.accounts.length === 0) {
      this.hideLoader();
      return noMetaMaskAlert();
    }
    var contracts = contractStore;
    var binSafeMathLib = contracts.safeMathLib.bin || ''
    var abiSafeMathLib = contracts.safeMathLib.abi || []
    var safeMathLib = contractStore.safeMathLib;
    deployContract(0, web3, abiSafeMathLib, binSafeMathLib, [], this.state, this.handleDeployedSafeMathLibrary)
  }

  handleDeployedSafeMathLibrary = (err, safeMathLibAddr) => {
    const { contractStore } = this.props
    console.log("safeMathLibAddr: " + safeMathLibAddr);
    if (err) {
      return this.hideLoader();
    }
    contractStore.setContractProperty('safeMathLib', 'addr', safeMathLibAddr)
    let keys = Object.keys(contractStore).filter(key => contractStore[key] !== undefined);
    for(let i=0;i<keys.length;i++){
        let key = keys[i];
        if (contractStore[key].bin){
          const newBin = window.reaplaceAll("__:SafeMathLibExt_______________________", safeMathLibAddr.substr(2), contractStore[key].bin);
          contractStore.setContractProperty(key, 'bin', newBin)

        }
    }
    this.deployToken();
  }

  deployToken = () => {
    const { web3Store, contractStore, tokenStore } = this.props
    const web3 = web3Store.web3
    console.log("***Deploy token contract***");
    if (web3.eth.accounts.length === 0) {
      this.hideLoader();
      return noMetaMaskAlert();
    }
    var contracts = contractStore
    var binToken = contracts && contracts.token && contracts.token.bin || ''
    var abiToken = contracts && contracts.token && contracts.token.abi || []
    var token = tokenStore;
    var paramsToken = this.getTokenParams(web3, token)
    console.log(paramsToken);
    deployContract(0, web3, abiToken, binToken, paramsToken, this.state, this.handleDeployedToken)
  }

  getTokenParams = (web3, token) => {
    const { tierStore } = this.props
    console.log(token);
    return [
      token.name,
      token.ticker,
      parseInt(token.supply, 10),
      parseInt(token.decimals, 10),
      true,
      tierStore.tiers[0].whitelistdisabled === "yes"?token.globalmincap?toFixed(token.globalmincap*10**token.decimals).toString():0:0
    ]
  }

  handleDeployedToken = (err, tokenAddr) => {
    const { contractStore } = this.props
    if (err) {
      return this.hideLoader();
    }
    contractStore.setContractProperty('token', 'addr', tokenAddr)
    this.deployPricingStrategy();
  }

  deployPricingStrategy = () => {
    const { web3Store, contractStore, tierStore } = this.props
    const web3 = web3Store.web3
    console.log("***Deploy pricing strategy contract***");
    if (web3.eth.accounts.length === 0) {
      return this.hideLoader();
      return noMetaMaskAlert();
    }
    let contracts = contractStore;
    let binPricingStrategy = contracts && contracts.pricingStrategy && contracts.pricingStrategy.bin || ''
    let abiPricingStrategy = contracts && contracts.pricingStrategy && contracts.pricingStrategy.abi || []
    let pricingStrategies = tierStore.tiers
    this.deployPricingStrategyRecursive(0, pricingStrategies, binPricingStrategy, abiPricingStrategy)
  }

  deployPricingStrategyRecursive = (i, pricingStrategies, binPricingStrategy, abiPricingStrategy) => {
    const { web3Store, contractStore, tokenStore } = this.props
    const web3 = web3Store.web3
    var paramsPricingStrategy = this.getPricingStrategyParams(pricingStrategies[i], i, tokenStore)
    if (i < pricingStrategies.length - 1) {
      deployContract(i, web3, abiPricingStrategy, binPricingStrategy, paramsPricingStrategy, this.state, (err, pricingStrategyAddr) => {
        i++;
        if (err) {
          this.hideLoader();
        }
        const newPricingStrategy = contractStore.pricingStrategy.addr.concat(pricingStrategyAddr)
        contractStore.setContractProperty('pricingStrategy', 'addr', newPricingStrategy)
        this.deployPricingStrategyRecursive(i, pricingStrategies, binPricingStrategy, abiPricingStrategy);
      })
    } else {
      deployContract(i, web3, abiPricingStrategy, binPricingStrategy, paramsPricingStrategy, this.state, this.handleDeployedPricingStrategy)
    }
  }

  //FlatPricing
  getPricingStrategyParams = (pricingStrategy, i, token) => {
    const { tierStore, web3Store } = this.props
    console.log('web3Store', web3Store.web3, web3Store.web3.utils.toWei)
    let oneTokenInETH = floorToDecimals(TRUNC_TO_DECIMALS.DECIMALS18, 1/pricingStrategy.rate)
    return [
      web3Store.web3.utils.toWei(oneTokenInETH, "ether"),
      tierStore.tiers[i].updatable?tierStore.tiers[i].updatable=="on"?true:false:false
    ]
  }

  handleDeployedPricingStrategy = (err, pricingStrategyAddr) => {
    const { contractStore, tierStore, web3Store } = this.props
    const web3 = web3Store.web3
    if (err) {
      return this.hideLoader();
    }
    const newPricingStrategy = contractStore.pricingStrategy.addr.concat(pricingStrategyAddr)
    contractStore.setContractProperty('pricingStrategy', 'addr', newPricingStrategy)
    //newState.loading = false;
    let abiCrowdsale = contractStore && contractStore.crowdsale && contractStore.crowdsale.abi || []
    let counter = 0;
    for (let i = 0; i < tierStore.tiers.length; i++) {
      getEncodedABIClientSide(web3, abiCrowdsale, [], i, (ABIencoded) => {
        counter++;
        let cntrct = "crowdsale";
        const newContract = contractStore[cntrct].abiConstructor.concat(ABIencoded)
        contractStore.setContractProperty(cntrct, 'abiConstructor', newContract)
        console.log(cntrct + " ABI encoded params constructor:");
        console.log(ABIencoded);
        if (counter == tierStore.tiers.length)
          this.deployCrowdsale();
      });
    }
  }

  deployCrowdsale = () => {
    const { web3Store, contractStore, tierStore } = this.props
    const web3 = web3Store.web3
    console.log("***Deploy crowdsale contract***");
    getNetworkVersion(web3).then((_networkID) => {
      console.log('web3', web3)
      if (web3.eth.accounts.length === 0) {
        this.hideLoader();
        return noMetaMaskAlert();
      }
      let newState = { ...this.state }
      newState.loading = true;
      this.setState(newState);
      contractStore.setContractProperty('crowdsale', 'networkID', _networkID)
      let contracts = contractStore;
      let binCrowdsale = contracts && contracts.crowdsale && contracts.crowdsale.bin || ''
      let abiCrowdsale = contracts && contracts.crowdsale && contracts.crowdsale.abi || []
      let crowdsales = tierStore;

      this.deployCrowdsaleRecursive(0, crowdsales, binCrowdsale, abiCrowdsale)
    });
  }

  deployCrowdsaleRecursive = (i, crowdsales, binCrowdsale, abiCrowdsale) => {
    const { contractStore, web3Store } = this.props
    const web3 = web3Store.web3
    let paramsCrowdsale;
    switch (contractStore.contractType) {
      case CONTRACT_TYPES.whitelistwithcap:
        paramsCrowdsale = this.getCrowdSaleParams(web3, i)
       break;
      default:
        break;
    }
    console.log(paramsCrowdsale);
    if (i < crowdsales.tiers.length - 1) {
      deployContract(i, web3, abiCrowdsale, binCrowdsale, paramsCrowdsale, this.state, (err, crowdsaleAddr) => {
        i++;
        if (err) {
          return this.hideLoader();
        }
        const newAddr = contractStore.crowdsale.addr.concat(crowdsaleAddr);
        contractStore.setContractProperty('crowdsale', 'addr', newAddr)
        this.deployCrowdsaleRecursive(i, crowdsales, binCrowdsale, abiCrowdsale);
      })
    } else {
      deployContract(i, web3, abiCrowdsale, binCrowdsale, paramsCrowdsale, this.state, this.handleDeployedCrowdsaleContract)
    }
  }

  //MintedTokenCappedCrowdsale
  getCrowdSaleParams = (web3, i) => {
    const { contractStore, tierStore, tokenStore } = this.props
    return [
      contractStore.token.addr,
      contractStore.pricingStrategy.addr[i],
      tierStore.tiers[0].walletAddress,
      toFixed(parseInt(Date.parse(tierStore.tiers[i].startTime)/1000, 10).toString()),
      toFixed(parseInt(Date.parse(tierStore.tiers[i].endTime)/1000, 10).toString()),
      toFixed("0"),
      toFixed(parseInt(tierStore.tiers[i].supply, 10)*10**parseInt(tokenStore.decimals, 10)).toString(),
      tierStore.tiers[i].updatable?tierStore.tiers[i].updatable=="on"?true:false:false,
      tierStore.tiers[0].whitelistdisabled?tierStore.tiers[0].whitelistdisabled=="yes"?false:true:false
    ]
  }

  handleDeployedCrowdsaleContract = (err, crowdsaleAddr) => {
    const { contractStore } = this.props
    if (err) {
      return this.hideLoader();
    }
    const newAddr = contractStore.crowdsale.addr.concat(crowdsaleAddr);
    contractStore.setContractProperty('crowdsale', 'addr', newAddr)
    this.calculateABIEncodedArgumentsForFinalizeAgentContractDeployment();
  }

  calculateABIEncodedArgumentsForFinalizeAgentContractDeployment = () => {
    const { web3Store, contractStore, tierStore } = this.props
    const web3 = web3Store.web3
    let newState = { ...this.state }
    console.log(newState);

    let abiNullFinalizeAgent = contractStore.nullFinalizeAgent && contractStore.nullFinalizeAgent.abi || []
    let abiLastFinalizeAgent = contractStore.finalizeAgent && contractStore.finalizeAgent.abi || []
    let counter = 0;

    for (let i = 0; i < tierStore.tiers.length; i++) {
      let abiFinalizeAgent
      if (i < tierStore.tiers.length - 1) {
        abiFinalizeAgent = abiNullFinalizeAgent
      } else {
        abiFinalizeAgent = abiLastFinalizeAgent
      }

      getEncodedABIClientSide(web3, abiFinalizeAgent, [], i, (ABIencoded) => {
        counter++;
        let cntrct = "finalizeAgent";
        const newAbi = contractStore[cntrct].abiConstructor.concat(ABIencoded);
        contractStore.setContractProperty(cntrct, 'abiConstructor', newAbi)
        console.log(cntrct + " ABI encoded params constructor:");
        console.log(ABIencoded);
        if (counter == (tierStore.tiers.length)) {
          this.deployFinalizeAgent();
        }
      });
    }
  }

  deployFinalizeAgent = () => {
    const { web3Store, contractStore } = this.props
    const web3 = web3Store.web3
    console.log("***Deploy finalize agent contract***");
    if (web3.eth.accounts.length === 0) {
      this.hideLoader();
      return noMetaMaskAlert();
    }
    let binNullFinalizeAgent = contractStore && contractStore.nullFinalizeAgent && contractStore.nullFinalizeAgent.bin || ''
    let abiNullFinalizeAgent = contractStore && contractStore.nullFinalizeAgent && contractStore.nullFinalizeAgent.abi || []

    let binFinalizeAgent = contractStore && contractStore.finalizeAgent && contractStore.finalizeAgent.bin || ''
    let abiFinalizeAgent = contractStore && contractStore.finalizeAgent && contractStore.finalizeAgent.abi || []

    let crowdsales;
    if (this.state.tokenStoreIsAlreadyCreated) {
      let curTierAddr = [ contractStore.crowdsale.addr.slice(-1)[0] ];
      let prevTierAddr = [ contractStore.crowdsale.addr.slice(-2)[0] ];
      crowdsales = [prevTierAddr, curTierAddr];
    }
    else
      crowdsales = contractStore.crowdsale.addr;
    this.deployFinalizeAgentRecursive(0, crowdsales, web3, abiNullFinalizeAgent, binNullFinalizeAgent, abiFinalizeAgent, binFinalizeAgent, this.state)
  }

  deployFinalizeAgentRecursive = (i, crowdsales, web3, abiNull, binNull, abiLast, binLast, state) => {
    const { contractStore } = this.props
    let abi, bin, paramsFinalizeAgent;
    if (i < crowdsales.length - 1) {
      abi = abiNull;
      bin = binNull;
      paramsFinalizeAgent = this.getNullFinalizeAgentParams(web3, i)

      console.log(paramsFinalizeAgent);
      deployContract(i, web3, abi, bin, paramsFinalizeAgent, state, (err, finalizeAgentAddr) => {
        i++;
        if (err) {
          return this.hideLoader();
        }
        const newAddr = contractStore.finalizeAgent.addr.concat(finalizeAgentAddr);
        contractStore.setContractProperty('finalizeAgent', 'addr', newAddr)
        this.deployFinalizeAgentRecursive(i, crowdsales, web3, abiNull, binNull, abiLast, binLast, state)
      })
    } else {
      abi = abiLast;
      bin = binLast;
      paramsFinalizeAgent = this.getFinalizeAgentParams(web3, i)
      console.log(paramsFinalizeAgent);
      deployContract(i, web3, abi, bin, paramsFinalizeAgent, state, this.handleDeployedFinalizeAgent)
    }
  }

  getNullFinalizeAgentParams = (web3, i) => {
    return [
      this.props.contractStore.crowdsale.addr[i]
    ]
  }

  getFinalizeAgentParams = (web3, i) => {
    const { contractStore } = this.props
    return [
      contractStore.token.addr,
      contractStore.crowdsale.addr[i]
    ]
  }

  handleDeployedFinalizeAgent = (err, finalizeAgentAddr) => {
    const { contractStore, reservedTokenStore, tierStore, tokenStore, web3Store } = this.props
    const web3 = web3Store.web3
    let newState = { ...this.state }
    if (err) {
      return this.hideLoader();
    }
    const newAddr = contractStore.finalizeAgent.addr.concat(finalizeAgentAddr);
    contractStore.setContractProperty('finalizeAgent', 'addr', newAddr)

    let tokenABI = JSON.parse(JSON.stringify(contractStore.token.abi))
    let pricingStrategyABI = JSON.parse(JSON.stringify(contractStore.pricingStrategy.abi))
    let crowdsaleABI = JSON.parse(JSON.stringify(contractStore.crowdsale.abi))

    setLastCrowdsaleRecursive(0, web3, pricingStrategyABI, contractStore.pricingStrategy.addr, contractStore.crowdsale.addr.slice(-1)[0], 142982, (err) => {
      if (err) return this.hideLoader();
      setReservedTokensListMultiple(web3, tokenABI, contractStore.token.addr, tokenStore, reservedTokenStore, (err) => {
        if (err) return this.hideLoader();
        updateJoinedCrowdsalesRecursive(0, web3, crowdsaleABI, contractStore.crowdsale.addr, 293146, (err) => {
          if (err) return this.hideLoader();
          setMintAgentRecursive(0, web3, tokenABI, contractStore.token.addr, contractStore.crowdsale.addr, 68425, (err) => {
            if (err) return this.hideLoader();
            setMintAgentRecursive(0, web3, tokenABI, contractStore.token.addr, contractStore.finalizeAgent.addr, 68425, (err) => {
              if (err) return this.hideLoader();
              addWhiteListRecursive(0, web3, tierStore, tokenStore, crowdsaleABI, contractStore.crowdsale.addr, (err) => {
                if (err) return this.hideLoader();
                setFinalizeAgentRecursive(0, web3, crowdsaleABI, contractStore.crowdsale.addr, contractStore.finalizeAgent.addr, 68622, (err) => {
                  if (err) return this.hideLoader();
                  setReleaseAgentRecursive(0, web3, tokenABI, contractStore.token.addr, contractStore.finalizeAgent.addr, 65905, (err) => {
                    if (err) return this.hideLoader();
                    transferOwnership(web3, tokenABI, contractStore.token.addr, tierStore.tiers[0].walletAddress, 46699, (err) => {
                      this.hideLoader();
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }

  downloadContractButton = () => {
    this.downloadCrowdsaleInfo();
    this.contractDownloadSuccess({ offset: 14 })
  }

  goToCrowdsalePage = () => {
    const { contractStore } = this.props
    if (!contractStore.crowdsale.addr) {
      return noContractDataAlert();
    }
    if (contractStore.crowdsale.addr.length === 0) {
      return noContractDataAlert();
    }
    let crowdsalePage = "/crowdsale";
    const isValidContract = contractStore && contractStore.crowdsale && contractStore.crowdsale.addr

    let url;
    url = crowdsalePage + `?addr=` + contractStore.crowdsale.addr[0]
    url += `&networkID=` + contractStore.crowdsale.networkID

    if (!this.state.contractDownloaded) {
      this.downloadCrowdsaleInfo()
      setTimeout(this.contractDownloadSuccess, 450)
    }

    let newHistory = isValidContract ? url : crowdsalePage
    this.props.history.push(newHistory);
  }

  render() {
    const { tierStore, contractStore, tokenStore } = this.props
    let crowdsaleSetups = [];
    for (let i = 0; i < tierStore.tiers.length; i++) {
      let capBlock = <DisplayField
        side='left'
        title={'Max cap'}
        value={tierStore.tiers[i].supply?tierStore.tiers[i].supply:""}
        description="How many tokens will be sold on this tier."
      />
      let updatableBlock = <DisplayField
        side='right'
        title={'Allow modifying'}
        value={tierStore.tiers[i].updatable?tierStore.tiers[i].updatable:"off"}
        description="Pandora box feature. If it's enabled, a creator of the crowdsale can modify Start time, End time, Rate, Limit after publishing."
      />

      crowdsaleSetups.push(<div key={i.toString()}><div className="publish-title-container">
          <p className="publish-title" data-step={3+i}>Crowdsale Setup {tierStore.tiers[i].tier}</p>
        </div>
        <div className="hidden">
          <div className="hidden">
            <DisplayField
              side='left'
              title={'Start time'}
              value={tierStore.tiers[i].startTime?tierStore.tiers[i].startTime.split("T").join(" "):""}
              description="Date and time when the tier starts."
            />
            <DisplayField
              side='right'
              title={'End time'}
              value={tierStore.tiers[i].endTime?tierStore.tiers[i].endTime.split("T").join(" "):""}
              description="Date and time when the tier ends."
            />
          </div>
          <div className="hidden">
            <DisplayField
              side='left'
              title={'Wallet address'}
              value={tierStore.tiers[i].walletAddress?tierStore.tiers[i].walletAddress:""}
              description="Where the money goes after investors transactions."
            />
            <DisplayField
              side='right'
              title={'RATE'}
              value={tierStore.tiers[i].rate?tierStore.tiers[i].rate:0 + " ETH"}
              description="Exchange rate Ethereum to Tokens. If it's 100, then for 1 Ether you can buy 100 tokens."
            />
          </div>
          {contractStore.contractType===CONTRACT_TYPES.whitelistwithcap?capBlock:""}
          {contractStore.contractType===CONTRACT_TYPES.whitelistwithcap?updatableBlock:""}
        </div></div>);
    }
    let ABIEncodedOutputsCrowdsale = [];
    for (let i = 0; i < tierStore.tiers.length; i++) {
      ABIEncodedOutputsCrowdsale.push(
        <DisplayTextArea
          key={i.toString()}
          label={"Constructor Arguments for " + (tierStore.tiers[i].tier?tierStore.tiers[i].tier : "contract") + " (ABI-encoded and appended to the ByteCode above)"}
          value={contractStore?contractStore.crowdsale?contractStore.crowdsale.abiConstructor?contractStore.crowdsale.abiConstructor[i]:"":"":""}
          description="Encoded ABI"
        />
      );
    }
    let ABIEncodedOutputsPricingStrategy = [];
    for (let i = 0; i < tierStore.tiers.length; i++) {
      ABIEncodedOutputsPricingStrategy.push(
        <DisplayTextArea
          key={i.toString()}
          label={"Constructor Arguments for " + (tierStore.tiers[i].tier?tierStore.tiers[i].tier : "") + " Pricing Strategy Contract (ABI-encoded and appended to the ByteCode above)"}
          value={contractStore?contractStore.pricingStrategy?contractStore.pricingStrategy.abiConstructor?contractStore.pricingStrategy.abiConstructor[i]:"":"":""}
          description="Contructor arguments for pricing strategy contract"
        />
      );
    }
    let ABIEncodedOutputsFinalizeAgent = [];
    for (let i = 0; i < tierStore.tiers.length; i++) {
      ABIEncodedOutputsFinalizeAgent.push(
        <DisplayTextArea
          key={i.toString()}
          label={"Constructor Arguments for " + (tierStore.tiers[i].tier?tierStore.tiers[i].tier : "") + " Finalize Agent Contract (ABI-encoded and appended to the ByteCode above)"}
          value={contractStore?contractStore.finalizeAgent?contractStore.finalizeAgent.abiConstructor?contractStore.finalizeAgent.abiConstructor[i]:"":"":""}
          description="Contructor arguments for finalize agent contract"
        />
      );
    }
    let globalLimitsBlock = <div><div className="publish-title-container">
      <p className="publish-title" data-step={2 + tierStore.tiers.length + 2}>Global Limits</p>
    </div>
    <div className="hidden">
      <DisplayField
        side='left'
        title='Min Cap'
        value={tokenStore.globalmincap}
        description="Min Cap for all onvestors"
      /></div>
    </div>;
    let tokenBlock = <div>
      <DisplayTextArea
        label={"Token Contract Source Code"}
        value={contractStore?contractStore.token?contractStore.token.src:"":""}
        description="Token Contract Source Code"
      />
      <DisplayTextArea
        label={"Token Contract ABI"}
        value={contractStore?contractStore.token?JSON.stringify(contractStore.token.abi):"":""}
        description="Token Contract ABI"
      />
       <DisplayTextArea
        label={"Token Constructor Arguments (ABI-encoded and appended to the ByteCode above)"}
        value={contractStore?contractStore.token?contractStore.token.abiConstructor?contractStore.token.abiConstructor:"":"":""}
        description="Token Constructor Arguments"
      />
    </div>;
    let pricingStrategyBlock = <div>
      <DisplayTextArea
        label={"Pricing Strategy Contract Source Code"}
        value={contractStore?contractStore.pricingStrategy?contractStore.pricingStrategy.src:"":""}
        description="Pricing Strategy Contract Source Code"
      />
      <DisplayTextArea
        label={"Pricing Strategy Contract ABI"}
        value={contractStore?contractStore.pricingStrategy?JSON.stringify(contractStore.pricingStrategy.abi):"":""}
        description="Pricing Strategy Contract ABI"
      />
    </div>;
    let finalizeAgentBlock = <div>
      <DisplayTextArea
        label={"Finalize Agent Contract Source Code"}
        value={contractStore?contractStore.finalizeAgent?contractStore.finalizeAgent.src:"":""}
        description="Finalize Agent Contract Source Code"
      />
      <DisplayTextArea
        label={"Finalize Agent Contract ABI"}
        value={contractStore?contractStore.finalizeAgent?JSON.stringify(contractStore.finalizeAgent.abi):"":""}
        description="Finalize Agent Contract ABI"
      />
    </div>;
    return (
      <section className="steps steps_publish">
        <StepNavigation activeStep={PUBLISH} />
        <div className="steps-content container">
          <div className="about-step">
            <div className="step-icons step-icons_publish"></div>
            <p className="title">Publish</p>
            <p className="description">
            On this step we provide you artifacts about your token and crowdsale contracts. They are useful to verify contracts source code on <a href="https://etherscan.io/verifyContract">Etherscan</a>
            </p>
          </div>
          <div className="hidden">
            <div className="item">
              <div className="publish-title-container">
                <p className="publish-title" data-step="1">Crowdsale Contract</p>
              </div>
              <p className="label">{contractStore.contractType===CONTRACT_TYPES.standard?"Standard":"Whitelist with cap"}</p>
              <p className="description">
              Crowdsale Contract
              </p>
            </div>
            <div className="publish-title-container">
              <p className="publish-title" data-step="2">Token Setup</p>
            </div>
            <div className="hidden">
              <div className="hidden">
                <DisplayField
                  side='left'
                  title='Name'
                  value={tokenStore.name?tokenStore.name:""}
                  description="The name of your token. Will be used by Etherscan and other token browsers."
                />
                <DisplayField
                  side='right'
                  title='Ticker'
                  value={tokenStore.ticker?tokenStore.ticker:""}
                  description="The three letter ticker for your token."
                />
              </div>
              <div className="hidden">
                <DisplayField
                  side='left'
                  title='DECIMALS'
                  value={tokenStore.decimals?tokenStore.decimals.toString():""}
                  description="The decimals of your token."
                />
              </div>
            </div>
            {crowdsaleSetups}
            <div className="publish-title-container">
              <p className="publish-title" data-step={2 + tierStore.tiers.length + 1}>Crowdsale Setup</p>
            </div>
            <div className="hidden">
              <DisplayField
                side='left'
                title='Compiler Version'
                value={'0.4.11'}
                description="Compiler Version"
              />
              <DisplayField
                side='right'
                title='Contract name'
                value={'MintedTokenCappedCrowdsaleExt'}
                description="Crowdsale contract name"
              />
              <DisplayField
                side='left'
                title='Optimized'
                value={true.toString()}
                description="Optimization in compiling"
              />
            </div>
            {tierStore.tiers[0].whitelistdisabled === "yes"?globalLimitsBlock:""}
            {tokenBlock}
            {pricingStrategyBlock}
            {ABIEncodedOutputsPricingStrategy}
            {finalizeAgentBlock}
            {ABIEncodedOutputsFinalizeAgent}
            <DisplayTextArea
              label={"Crowdsale Contract Source Code"}
              value={contractStore?contractStore.crowdsale?contractStore.crowdsale.src:"":""}
              description="Crowdsale Contract Source Code"
            />
            <DisplayTextArea
              label={"Crowdsale Contract ABI"}
              value={contractStore?contractStore.crowdsale?JSON.stringify(contractStore.crowdsale.abi):"":""}
              description="Crowdsale Contract ABI"
            />
            {ABIEncodedOutputsCrowdsale}
          </div>
        </div>
        <div className="button-container">
          <div onClick={this.downloadContractButton} className="button button_fill_secondary">Download File</div>
          <a onClick={this.goToCrowdsalePage} className="button button_fill">Continue</a>
        </div>
        <Loader show={this.state.loading}></Loader>
      </section>
    )}
}
