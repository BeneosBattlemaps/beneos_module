/********************************************************************************* */
import { BeneosTableTop } from "./beneos-table-top.js";
import { BeneosCompendiumManager, BeneosCompendiumReset } from "./beneos_compendium.js";
import { BeneosSearchEngineLauncher, BeneosDatabaseHolder, BeneosModuleMenu } from "./beneos_search_engine.js";
import { ClassCounter  } from "./count-class-ready.js";
import { BeneosCloud, BeneosCloudLogin } from "./beneos_cloud.js";

/********************************************************************************* */
globalThis.BENEOS_MODULE_NAME = "Beneos Module"
globalThis.BENEOS_MODULE_ID = "beneos-module"
globalThis.BENEOS_DEFAULT_TOKEN_PATH = "beneos_assets"

let beneosDebug = true
let beneosFadingSteps = 10
let beneosFadingWait = 30
let beneosFadingTime = beneosFadingSteps * beneosFadingWait
let __mask = 0xffffffff

/********************************************************************************** */
export class BeneosActorTokenMigration extends FormApplication {

  /********************************************************************************** */
  async performMigrate() {

    ui.notifications.info("Searching actors and token to migrate ....")

    // Migrate actors
    for (let actor of game.actors) {
      if (actor?.img.includes("beneos-module") && !actor.img.includes(BeneosUtility.tokenDataPath)) {
        let oldImgData = BeneosUtility.getTokenImageInfo(actor.img)
        let newImgPath = BeneosUtility.getFullPathWithSlash() + oldImgData.fullKey + "/" + oldImgData.filename
        await actor.update({ 'img': newImgPath })
        console.log("actor update...", actor.name, actor.img)
      }
      if (actor?.token.img.includes("beneos-module") && !actor.token.img.includes(BeneosUtility.tokenDataPath)) {
        let oldTokenImgData = BeneosUtility.getTokenImageInfo(actor.texture.src)
        let newTokenImgPath = BeneosUtility.getFullPathWithSlash() + oldTokenImgData.fullKey + "/" + oldTokenImgData.pathVariant + "/" + oldTokenImgData.filename
        await actor.update({ 'token.img': newTokenImgPath })
        console.log("actor token update...", actor.name, actor.token.texture.src)
      }
    }
    // Migrate tokens on scenes
    for (let scene of game.scenes) {
      for (let token of scene.tokens) {
        if (token?.texture.src.includes("beneos-module") && !token.texture.src.includes(BeneosUtility.tokenDataPath)) {
          let oldTokenImgData = BeneosUtility.getTokenImageInfo(token.texture.src)
          let newTokenImgPath = BeneosUtility.getFullPathWithSlash() + oldTokenImgData.fullKey + "/" + oldTokenImgData.pathVariant + "/" + oldTokenImgData.filename
          console.log("scene token update : ", scene.name, token.name)
          await token.update({ 'img': newTokenImgPath })
        }
      }
    }
    ui.notifications.info("Actors/Tokens migration finished !")
  }

  /********************************************************************************** */
  render() {
    this.performMigrate()
  }

}

/********************************************************************************* */
export class TableTopModeSettings extends FormApplication { 
	
  constructor(object = {}, options) {
		super(object, options);
	}

	/** @override */
	static get defaultOptions() {
		return {
			...super.defaultOptions,
			template: 'modules/beneos-module/templates/beneos-table-top-settings.html',
			height: 'auto',
			title: 'Table Top Mode Settings', 
			width: 600,
			classes: ['beneos-module', 'settings'],
			tabs: [
				{
					contentSelector: 'form',
				},
			],
			submitOnClose: false,
		};
	}

  static getDefaultTableTopSettings() { 
    let config = {
      tableTopEnabled: false,
      performanceModePerUsers: [],
      controlPlayerView: true,
      autoScaleTVGrid: true,
      autoScaleTVWidthDiagonal: 90,
      autoScaleTVRatio: "16/9",
      gridOpacity: 0.5,
      miniatureSize: 25,
    }
    return config
  }

  getData() {
    let data = super.getData();
    data.config = game.settings.get(BeneosUtility.moduleID(), 'beneos-table-top-config') || this.getDefaultTableTopSettings();
    // Check if performanceModePerUsers is an array or not 
    if ( !Array.isArray(data.config.performanceModePerUsers) ) {
      data.config.performanceModePerUsers = []
    }
    // Auto fill users
    for (let u of game.users) {
      if ( !data.config.performanceModePerUsers.find( x => x.id == u.id ) ) {
        data.config.performanceModePerUsers.push( { id: u.id, name: u.name,  perfMode: false } )
      }
    }
    return data
  }
  
  async _updateObject(_, formData) {
    const data = foundry.utils.expandObject(formData)
    let config = game.settings.get(BeneosUtility.moduleID(), 'beneos-table-top-config')
    data.performanceModePerUsers = foundry.utils.duplicate(config.performanceModePerUsers) || []
    if ( !Array.isArray(data.performanceModePerUsers) ) {
      data.config.performanceModePerUsers = []
      for (let u of game.users) {
        if ( !data.config.performanceModePerUsers.find( x => x.id == u.id ) ) {
          data.config.performanceModePerUsers.push( { id: u.id, name: u.name,  perfMode: false } )
        }
      }
    }
    //console.log("Updating object", data, config)
    for (let idx=0; idx<data.performanceModePerUsersArray.length; idx++) {
      if (data.performanceModePerUsers[idx]) { 
        data.performanceModePerUsers[idx].perfMode = data.performanceModePerUsersArray[idx] // Update with form flag value
      } else  {
        console.log("Error in updating user performance mode", idx, data)
      }
    }
    //console.log("Updating object",formData, data)
    await game.settings.set(BeneosUtility.moduleID(), 'beneos-table-top-config', data) 

    // Manage the ON/OFF value 
    await BeneosTableTop.manageTableTopMode(data.tableTopEnabled)

    window.location.reload() // Force reload after save
  }
}


/********************************************************************************* */
export class BeneosUtility {

  /********************************************************************************** */
  static forgeInit() {
    this.beneosBasePath = ""

    if (typeof ForgeVTT != "undefined" && ForgeVTT.usingTheForge) {
      this.debugMessage("[BENEOS MODULE] This process should only be run in Forge.")
      let ForgeVTTuserid = ForgeAPI.getUserId()
      ForgeVTTuserid.then(result => {
        this.beneosBasePath = ForgeVTT.ASSETS_LIBRARY_URL_PREFIX + result + "/"
      })
    }
  }

  /********************************************************************************** */
  static registerSettings() {

    // Common internal settings
    game.settings.register(BeneosUtility.moduleID(), 'beneos-user-config', {
      name: 'Internal data store for user-defined parameters',
      default: {},
      type: Object,
      scope: 'world',
      config: false
    })

      game.beneosTokens = {
        moduleId: BENEOS_MODULE_ID,
        BeneosUtility,
        BeneosCloud
      }
      
      /*game.settings.register(BeneosUtility.moduleID(), 'beneos-cloud-foundry-id', {
        name: 'Internal storage of the User ID with Beneos Cloud',
        default: "",
        type: String,
        scope: 'world',
        config: false,
        restricted: true
      })

      game.settings.registerMenu(BeneosUtility.moduleID(), "beneos-patreon-login", {
        name: "Login to Beneos Cloud with you Patreon account",
        label: "Login to Beneos Cloud with you Patreon account",
        hint: "Login to Beneos Cloud with you Patreon account",
        scope: 'world',
        config: true,
        type: BeneosCloudLogin,
        restricted: true
      })
    // console.log("Registering settings", game)*/

    game.settings.registerMenu(BeneosUtility.moduleID(), "beneos-clean-compendium", {
      name: "Empty compendium to re-import all tokens data",
      label: "Reset & Rebuild BeneosModule Compendiums",
      hint: "Cleanup BeneosModule compendium and tokens configs",
      scope: 'world',
      config: true,
      type: BeneosCompendiumReset,
      restricted: true
    })

    game.settings.registerMenu(BeneosUtility.moduleID(), "beneos-search-engine", {
      name: "Search Engine",
      label: "Search in published tokens/battlemaps",
      hint: "Search in all the published tokens/battlemaps from BeneosSearch engine",
      scope: 'world',
      config: true,
      type: BeneosSearchEngineLauncher,
      restricted: true
    })

    game.settings.register(BeneosUtility.moduleID(), "beneos-datapath", {
      name: "Storage path of tokens assets",
      hint: "Location of tokens and associated datas",
      scope: 'world',
      config: true,
      default: BENEOS_DEFAULT_TOKEN_PATH,
      type: String,
      restricted: true
    })

    game.settings.register(BeneosUtility.moduleID(), "beneos-god-mode", {
      name: "Enable God Mode",
      hint: "",
      scope: 'world',
      config: false,
      default: false,
      type: Boolean,
      restricted: true
    })

    game.settings.register(BeneosUtility.moduleID(), "beneos-animated-portrait-only", {
      name: "Display only animated portrait",
      hint: "If ticked, only portraits will be available ",
      scope: 'world',
      config: true,
      default: false,
      type: Boolean
    })

    game.settings.register(BeneosUtility.moduleID(), 'beneos-json-tokenconfig', {
      name: 'Global JSON config for tokens',
      type: String,
      scope: 'world',
      default: "",
      config: false
    })

    game.settings.register(BeneosUtility.moduleID(), 'beneos-json-itemconfig', {
      name: 'Global JSON config for items',
      type: String,
      scope: 'world',
      default: "",
      config: false
    })
    game.settings.register(BeneosUtility.moduleID(), 'beneos-json-spellconfig', {
      name: 'Global JSON config for spells',
      type: String,
      scope: 'world',
      default: "",
      config: false
    })


      game.settings.register('beneos-cloud', 'access_token', {
        name: 'Beneos Cloud Access Token',
        hint: 'Access token for Beneos Cloud (ie Patreon access key)',
        scope: 'world',
        config: true,
        type: String,
        restricted: true,
        default: ''
      })
    game.settings.register(BeneosUtility.moduleID(), 'beneos-user-config', {
      name: 'Internal data store for user-defined parameters',
      default: {},
      type: Object,
      scope: 'world',
      config: false
    })

    game.settings.register(BeneosUtility.moduleID(), 'beneos-ui-state', {
      name: 'Internal data store for user-defined parameters',
      default: {},
      type: Boolean,
      scope: 'world',
      config: false,
      default: true
    })

    /*game.settings.register(BeneosUtility.moduleID(), 'beneos-table-top-config', {
      name: 'Internal data store for table top mode settings',
      default: TableTopModeSettings.getDefaultTableTopSettings(),
      type: Object,
      scope: 'world',
      config: false
    })

    const menuTableTopModeSettings = {
			key: 'tableTopModeSettings',
			config: {
				name: 'Configure Table Top mode',
        label: 'Table Top Mode',
				hint: 'Configure the Table Top mode features',
				type: TableTopModeSettings,
				restricted: true,
			},
		};

		const settingAutoTemplateSettings = {
			key: 'tableTopModeSettings',
			config: {
				name: 'Table Top mode settings',
				hint: 'Configure the Table Top mode settings',
				scope: 'world',
				config: false,
				default: {},
				type: Object,
			},
		};

    game.settings.registerMenu(BeneosUtility.moduleID(), menuTableTopModeSettings.key, menuTableTopModeSettings.config);
			game.settings.register(
				BeneosUtility.moduleID(),
				settingAutoTemplateSettings.key,
				foundry.utils.mergeObject(
					settingAutoTemplateSettings.config,
					{
            requiresReload: true
					},
					true,
					true
				)
			);*/
  }

  /********************************************************************************** */
  static getTableTopConfig() {
    return game.settings.get(BeneosUtility.moduleID(), 'beneos-table-top-config') || TableTopModeSettings.getDefaultTableTopSettings()
  }

  /********************************************************************************** */
  static setupSocket() {
    game.socket.on(`module.beneos-module`, (msg) => {
      //console.log('pl',payload)
      if (msg.name == 'msg_set_view_position') { BeneosTableTop.applyPosition(msg.data) }
      if (msg.name == 'msg_toggle_ui_elements') { BeneosTableTop.applyUIElements(msg.data) }
      if (msg.name == 'msg_request_user_view') { BeneosTableTop.sendUserViewMessage() }
      if (msg.name == 'msg_user_view_response') { BeneosTableTop.processUserCurrentView(msg.data) }
    });
  }

  /********************************************************************************** */
  static async tokenRotateThenMove(tokenDocument, update, info) {

    if (!update.x) update.x = tokenDocument.x;
    if (!update.y) update.y = tokenDocument.y;
    let r = new Ray(tokenDocument, update);
    let rotation = r.angle * 180 / Math.PI - 90;
    if (rotation < 0) rotation += 360;
    let difference = Math.max(tokenDocument.rotation, rotation) - Math.min(tokenDocument.rotation, rotation)
    if (difference > 180) difference -= 360;
    if (difference < -180) difference += 360;
    let duration = Math.round(Math.abs(difference) * Math.sqrt(tokenDocument.width) * 1.0);
    if (!tokenDocument.lockRotation) {
      await tokenDocument.update({ rotation }, { ...info, animate: true, animation: { duration } });
      await new Promise((r) => setTimeout(r, duration));
    }
    duration = r.distance * 2;
    await tokenDocument.update(update, { ...info, rotated: true, animate: true, animation: { duration: duration } })
  }

  /********************************************************************************** */
  static reloadInternalSettings() {
    try {
      this.beneosTokens = JSON.parse(game.settings.get(BeneosUtility.moduleID(), 'beneos-json-tokenconfig'))
    }
    catch {
      console.log("BeneosModule : *************** Token JSON loading error ! **************")
      this.beneosTokens = {}
    }

    try {
      this.beneosSpells = JSON.parse(game.settings.get(BeneosUtility.moduleID(), 'beneos-json-spellconfig'))
    }
    catch {
      console.log("BeneosModule : *************** Spell JSON loading error ! **************")
      this.beneosSpells = {}
    }

    try {
      this.beneosItems = JSON.parse(game.settings.get(BeneosUtility.moduleID(), 'beneos-json-itemconfig'))
    }
    catch {
      console.log("BeneosModule : *************** Item JSON loading error ! **************")
      this.beneosItems = {}
    }
  }

  /********************************************************************************** */
  static ready() {
    this.file_cache = {}
    this.titleCache = {}

    //this.userSizes = foundry.utils.duplicate(game.settings.get(BeneosUtility.moduleID(), 'beneos-user-config'))
    this.beneosModule = true // Deprecated game.settings.get(BeneosUtility.moduleID(), 'beneos-animations')
    if (game.user.isGM) {
      this.tokenDataPath = game.settings.get(BeneosUtility.moduleID(), 'beneos-datapath')
      this.itemDataPath = game.settings.get(BeneosUtility.moduleID(), 'beneos-datapath')
      this.spellDataPath = game.settings.get(BeneosUtility.moduleID(), 'beneos-datapath')
      this.tokenDataPath += "/beneos_tokens/"
      this.itemDataPath += "/beneos_items/"
      this.spellDataPath += "/beneos_spells/"
      let stats = this.countBeneosAssetsUsage()
      try {
        ClassCounter.registerUsageCount('beneos-module', { beneosStats: stats })
      } catch (e) {
        console.log("Unable to register usage count, not important", e)
      }
    }
    this.sheetLoaded = false

    this.beneosHealth = {}
    this.standingImage = {}
    this.beneosPreload = []
    this.beneosTokens = {}
    this.beneosSpells = {}
    this.beneosItems = {}

    this.reloadInternalSettings()
    console.log("Loaded", this.beneosTokens)

    this.m_w = 123456789
    this.m_z = 987654321
    this.seed(Date.now())

    Handlebars.registerHelper('isEmpty', function (text) {
      if (typeof text !== 'string' && typeof text !== 'object') return false
      return text.length === 0
    })
    Handlebars.registerHelper('beneosAdd', function (a, b) {
      return parseInt(a) + parseInt(b);
    });

    Handlebars.registerHelper('beneosLength', function (text) {
      if (typeof text !== 'string' && typeof text !== 'object') return 0
      return text.length
    })
    Handlebars.registerHelper('beneosUpperFirst', function (text) {
      if (typeof text !== 'string') return text
      return text.charAt(0).toUpperCase() + text.slice(1)
    })
    Handlebars.registerHelper('getTagDescription', function (text) {
      return BeneosDatabaseHolder.getTagDescription(text)
    })
    Handlebars.registerHelper('beneosLowerCase', function (text) {
      if (typeof text !== 'string') return text
      return text.toLowerCase()
    })
    Handlebars.registerHelper('beneosGetHover', function (category, term) {
      return BeneosDatabaseHolder.getHover(category, term)
    })
    Handlebars.registerHelper('beneosChoose', function (text1, text2) {
      if (text1 && text1 != "") {
        return text1
      }
      return text2
    })

    let stats = this.countBeneosAssetsUsage()
    ClassCounter.registerUsageCount('beneos-module', { beneosStats: stats })

    //Token Magic Hack  Replacement to prevent double filters when changing animations
    if (typeof TokenMagic !== 'undefined') {
      let OrigSingleLoadFilters = TokenMagic._singleLoadFilters;
      TokenMagic._singleLoadFilters = async function (placeable, bulkLoading = false) {
        if (BeneosUtility.checkIsBeneosToken(placeable)) return;
        OrigSingleLoadFilters(placeable, bulkLoading);
      }
    } else {
      console.log("No Token Magic found !!!")
    }

  }

  /********************************************************************************** */
  static countBeneosAssetsUsage() {
    let statsBeneos = { maps: {}, tokens: {}, items: {}, spells: {} }
    for (let scene of game.scenes) {
      if (scene.background?.src?.includes('beneos-battlemaps-universe')) {
        statsBeneos.maps[scene.background.src] = (statsBeneos.maps[scene.background.src]) ? statsBeneos.maps[scene.background.src] + 1 : 1
      }
    }
    for (let item of game.items) {
      if (item.img.includes('beneos_assets')) {
        let itemData = this.getItemSpellImageInfo(item.img)
        if (item.type == 'spell') {
          statsBeneos.spells[itemData.itemKey] = (statsBeneos.spells[itemData.itemKey]) ? statsBeneos.spells[itemData.itemKey] + 1 : 1
        } else {
          statsBeneos.items[itemData.itemKey] = (statsBeneos.items[itemData.itemKey]) ? statsBeneos.items[itemData.itemKey] + 1 : 1
        }
      }
    }
    for (let actor of game.actors) {
      if (actor.prototypeToken?.texture?.src.includes('beneos_assets')) {
        let tokenData = this.getTokenImageInfo(actor.prototypeToken.texture.src)
        if (tokenData?.fullKey) {
          statsBeneos.tokens[tokenData.fullKey] = (statsBeneos.tokens[tokenData.fullKey]) ? statsBeneos.tokens[tokenData.fullKey] + 1 : 1
        }
      }
    }
    return statsBeneos
  }

  /********************************************************************************** */
  static getItemSpellImageInfo(newImage) {
    // beneos_assets/beneos_spells/0027_gunpowder_cloud/0027_gunpowder_cloud-icon.webp
    let dataPath = {
      itemKey: newImage
    }
    let apath = newImage.split("/")
    let itemKey = apath[apath.length - 2]
    let filename = apath[apath.length - 1]
    if (itemKey) {
      dataPath = { img: newImage, filename, itemKey }
    }
    return dataPath
  }

  /********************************************************************************** */
  static isSwitchableBeneosBattlemap(sceneId, fileType) {
    let scene = game.scenes.get(sceneId)
    let srcPath = scene.background.src
    let tileId = "scene"


    if (!srcPath) {
      for (let tile of scene.tiles) {
        if (tile.texture?.src?.toLowerCase().match(/beneos_battlemaps/) &&
          (tile.texture?.src?.toLowerCase().match(/4k/) || tile.texture?.src?.toLowerCase().match(/hd/))) {
          srcPath = tile.texture.src
          tileId = tile.id
          break
        }
      }
    }

    if (srcPath && game.user.isGM && !(srcPath.toLowerCase().match(/intro/)) && srcPath.toLowerCase().match(/beneos_battlemaps/) &&
      (srcPath.toLowerCase().match(/4k/) || srcPath.toLowerCase().match(/hd/)) &&
      (srcPath.toLowerCase().includes(fileType))) {
      return tileId
    } else {
      return undefined
    }
  }

  /********************************************************************************** */
  static getBattlemapSrcPath(sceneId, tileId) {
    let scene = game.scenes.get(sceneId)
    let bg = scene.background.src
    if (tileId != "scene") {
      let tile = scene.tiles.get(tileId)
      bg = tile.texture.src
    }
    return bg
  }

  /********************************************************************************** */
  static switchPhase(sceneId, command) {
    let tileId = this.isSwitchableBeneosBattlemap(sceneId, command == "toStatic" ? "webm" : "webp")
    let scene = game.scenes.get(sceneId)

    if (scene) {
      let tile
      if (tileId != "scene") {
        tile = scene.tiles.get(tileId)
      }

      //console.log("Scene : ", scene)
      let srcPath = (tile) ? tile.texture.src : scene.background.src
      if (command == "toStatic") {
        srcPath = srcPath.replace("webm", "webp")
      } else {
        srcPath = srcPath.replace("webp", "webm")
      }
      console.log("New path : ", srcPath)
      if (tile) {
        scene.updateEmbeddedDocuments("Tile", [({ _id: tile.id, 'texture.src': srcPath })])
      } else {
        scene.update({ 'background.src': srcPath })
      }
      //scene.background.src = srcPath
    }
  }

  /********************************************************************************** */
  static resetTokenData() {
    this.beneosTokens = {}
  }

  /********************************************************************************** */
  static upperFirst(text) {
    if (typeof text !== 'string') return text
    return text.charAt(0).toUpperCase() + text.slice(1)
  }

  /********************************************************************************** */
  static debugMessage(msg, data) {
    if (BeneosUtility.isDebug()) {
      console.log(msg, data)
    }
  }

  /********************************************************************************** */
  static moduleName() {
    return BENEOS_MODULE_NAME
  }

  /********************************************************************************** */
  static getBeneosTokenDataPath() {
    return this.tokenDataPath
  }
  static getBeneosSpellDataPath() {
    return this.spellDataPath
  }
  static getBeneosItemDataPath() {
    return this.itemDataPath
  }

  /********************************************************************************** */
  static moduleID() {
    return BENEOS_MODULE_ID
  }

  /********************************************************************************** */
  static isDebug() {
    return beneosDebug
  }
  /********************************************************************************** */
  static isBeneosModule() {
    return true
  }

  /********************************************************************************** */
  static getBasePath() {
    if (this.beneosBasePath == undefined || this.beneosBasePath == null || this.beneosBasePath == "") {
      return ""
    }
    return this.beneosBasePath + "/"
  }

  /********************************************************************************** */
  static getFullPathWithSlash() {
    return this.getBasePath() + this.getBeneosTokenDataPath()
  }
  /********************************************************************************** */
  static seed(i) {
    this.m_w = (123456789 + i) & __mask
    this.m_z = (987654321 - i) & __mask
  }

  /********************************************************************************** */
  //Random function better than the default rand.
  static random() {
    this.m_z = (36969 * (this.m_z & 65535) + (this.m_z >> 16)) & __mask
    this.m_w = (18000 * (this.m_w & 65535) + (this.m_w >> 16)) & __mask
    let result = ((this.m_z << 16) + (this.m_w & 65535)) >>> 0
    result /= 4294967296
    return result
  }

  /********************************************************************************** */
  static newTokenSetup(token) {
    let object = (token.document) ? token.document : token
    let tokenData = BeneosUtility.getTokenImageInfo(object.texture.src)
    object.setFlag(BeneosUtility.moduleID(), "fullKey", tokenData.fullKey)
    object.setFlag("core", "randomizeVideo", false)
    let scaleFactor = this.getScaleFactor(token, object.texture.src)
    canvas.scene.updateEmbeddedDocuments("Token", [({ _id: token.id, scale: scaleFactor })])
    setTimeout(function () {
      BeneosUtility.updateToken(token.id, { forceupdate: true })
    }, 500)
  }

  /********************************************************************************** */
  static createToken(token) {
    if (BeneosUtility.checkIsBeneosToken(token)) {
      //console.log(">>>>>>>>>> CREATE TOKEN BENEOS")
      BeneosUtility.preloadToken(token)
      setTimeout(function () {
        BeneosUtility.newTokenSetup(token)
      }, 500)
    }
  }

  /********************************************************************************** */
  //Foundry default get token give errors from time to time. It's better to get them directly from de canvas.
  static getToken(tokenid) {
    return canvas.tokens.placeables.find(t => t.id == tokenid)
  }

  /********************************************************************************** */
  // Checks if the token image is inside the beneos tokens module
  static checkIsBeneosToken(token) {
    // Previous version : return (token?.document?.texture?.src.includes(this.tokenDataPath) ?? token?.texture?.src.includes(this.tokenDataPath))
    return token?.actor?.getFlag("world", "beneos");
  }

  /********************************************************************************** */
  //Retrieves the necessary data from a token in order to be able to fire automatic animations based on the current token image file.
  static getTokenImageInfo(token) {

    let fullKey = token?.document?.getFlag(BeneosUtility.moduleID(), "fullKey")
    if (fullKey) {
      return BeneosUtility.beneosTokens[fullKey]
    }

    let beneos = token?.actor?.getFlag("world", "beneos");
    if (beneos) {
      let fullKey = beneos.fullId
      return BeneosUtility.beneosTokens[fullKey]
    }
    return {}
  }

    /********************************************************************************** */
  //Retrieves the necessary data from a token in order to be able to fire automatic animations based on the current token image file.
  static getTokenDataFromKey(fullKey) {
    if (fullKey) {
      return BeneosUtility.beneosTokens[fullKey]
    }
    return {}
  }

  /********************************************************************************** */
  //Function that preloads token animations. We need to do it to prevent the "scale not found" error in Foundry
  static preloadToken(token) {
    // Not sure to keep this as it was used to preload animations
    let myToken = this.getTokenImageInfo(token)

    if (!myToken) {
      BeneosUtility.debugMessage("[BENEOS MODULE] Config not found preloadToken " + token.name)
      return
    }

  }

  /********************************************************************************** */
  static preloadImage(finalImage) {
    TextureLoader.loader.loadTexture(finalImage)
  }

  /********************************************************************************** */
  static preloadVideo(finalImage) {
    TextureLoader.loader.loadTexture(finalImage)
  }

  /********************************************************************************** */
  //Function to change the token animations
  static async changeAnimation(token, animation, tkangle, tkalpha, tkanimtime, bfx, fading, forceStart) {

    this.debugMessage("[BENEOS MODULE] Changing to image:" + animation, token)

    let tkscale = this.getScaleFactor(token, animation) // Refresh proper token scale
    token.texture.src = animation
    tkangle = tkangle || token.rotation || token.document?.rotation || 0
    BeneosUtility.debugMessage("[BENEOS MODULE] Change animation with scale: " + tkscale, tkangle)
    if (token.state == "move" || token.state == "action") {
      await token.document.setFlag("core", "randomizeVideo", false)
    } else {
      await token.document.setFlag("core", "randomizeVideo", true)
    }
    if (token.state == "dead") {
      // TODO
    }
    await token.document.update({ img: animation, scale: tkscale, rotation: tkangle, alpha: 1.0, data: { img: animation } }, { animate: false })
    this.addFx(token, bfx, true, true)
    BeneosUtility.debugMessage("[BENEOS MODULE] Finished changing animation: " + tkscale)

  }

  /********************************************************************************** */
  static async applyDeadFX(token) {
    let bfx = ["BFXDead", "BFXDeadIcon"]
    this.addFx(token, bfx, true, true)

  }
  /********************************************************************************** */
  // Function to add FX from the Token Magic module or from the ones defined in the configuration files.
  static async addFx(token, bfx, replace = true, apply = true) {
    if (typeof TokenMagic !== 'undefined') {
      let bpresets = []

      $.each(bfx, function (index, value) {
        let bfxid = value
        let effect = TokenMagic.getPreset(bfxid)
        if (effect !== undefined) {
          BeneosUtility.debugMessage("[BENEOS MODULE] Setting Library FX: " + bfxid)
          $.each(effect, function (presetindex, pressetvalue) {
            bpresets.push(pressetvalue)
          })
        } else {
          if (beneosFX[bfxid] !== undefined) {
            BeneosUtility.debugMessage("[BENEOS MODULE] Setting Beneos FX: " + bfxid)
            $.each(beneosFX[bfxid], function (presetindex, pressetvalue) {
              $.each(pressetvalue, function (kid, kidvalue) {
                if (kid.indexOf("eval_") != -1) {
                  let newkid = kid.replace("eval_", "")
                  kidvalue = kidvalue.replace("random()", "BeneosUtility.random()")
                  kidvalue = kidvalue.replace("__BENEOS_DATA_PATH__", BeneosUtility.getBasePath() + BeneosUtility.getBeneosTokenDataPath())
                  pressetvalue[newkid] = eval(kidvalue)
                };
              });
              bpresets.push(pressetvalue)
            })
          }
        }
      })
      if (apply) {
        console.log("Adding effects", bpresets, replace)
        token.TMFXaddFilters(bpresets, replace)
      } else {
        return bpresets
      }
    }
  }

  /********************************************************************************** */
  static firstLetterUpper(mySentence) {
    const words = mySentence.split(" ");
    return words.map((word) => {
      return word[0].toUpperCase() + word.substring(1)
    }).join(" ")
  }

  /********************************************************************************** */
  static async prepareMenu(e, sheet) {
    if (e.button == 2) {
      let tokenList = BeneosUtility.buildAvailableTokensMenu()
      const beneosTokensDisplay = await BeneosUtility.buildAvailableTokensMenuHTML("beneos-actor-menu.html", tokenList)
      let menu = new BeneosModuleMenu(beneosTokensDisplay, tokenList, sheet.actor.token?.actor || sheet.actor, e.pageX, e.pageY, "beneos-actor-menu.html")
      menu.render(true)
    }
  }

  /********************************************************************************** */
  static getIdleTokens(token) {
    let tokenData = this.getTokenImageInfo(token)
    let fullKey = tokenData.fullKey
    let tokenList = []

    if (fullKey) {
      let tokenConfig = this.beneosTokens[fullKey]
      if (!tokenConfig) {
        ui.notifications.warn("Error in BeneosModule : the fullKey seems wrong " + fullKey)
        ui.notifications.warn("Check that the token image is a BeneosToken image, from the beneos tokens folder")
        console.log("Working fullKey - matchArray : ", fullKey, matchArray)
        return tokenList
      }
      //console.log("Token", fullKey, token, tokenConfig)
      for (let idleImg of tokenConfig.idleList) {
        if (game.settings.get(BeneosUtility.moduleID(), "beneos-animated-portrait-only")) {
          if (!idleImg.toLowerCase().match("face")) {
            continue
          }
        }
        let modeName = idleImg.match("(idle_[\\w_]*).web")
        modeName = this.firstLetterUpper(modeName[1].replace(/_/g, ", "))
        tokenList.push({
          isVideo: idleImg.includes("webm"),
          token: idleImg, //this.getFullPathWithSlash() + fullKey + '/' + fullKey + "-idle_face_still.webp",
          name: modeName, tokenvideo: idleImg
        })
      }
    } else {
      ui.notifications.warn("Error in BeneosModule : fullKey not found ")
      ui.notifications.warn("Check that the token image is a BeneosToken image, from the beneos tokens folder")
    }
    return tokenList
  }

  /********************************************************************************** */
  static getActorCompendium() {
    if (game.system.id == "pf2e") {
      return "beneos-module.beneos_module_actors_pf2"
    } else {
      return "beneos-module.beneos_module_actors"
    }

  }
  /********************************************************************************** */
  static isTokenLoaded(key) {
    for (let [fullKey, token] of Object.entries(this.beneosTokens)) {
      if (token.searchKey == key) {
        return true
      }
    }
    return false
  }
  static isItemLoaded(key) {
    return this.beneosItems[key]
  }
  static isSpellLoaded(key) {
    return this.beneosSpells[key]
  }

  /********************************************************************************** */
  static getActorIdVariant(key, idx) {
    for (let [fullKey, token] of Object.entries(this.beneosTokens)) {
      if (token.searchKey == key && token.number == idx) {
        return token.actorId
      }
    }
    return undefined
  }  
  static getActorId(key) {
    for (let [fullKey, token] of Object.entries(this.beneosTokens)) {
      if (token.searchKey == key) {
        return token.actorId
      }
    }
    return undefined
  }  
  static getItemId(key) {
    let token = this.beneosItems[key]
    if (token) {
      return token.itemId
    }
    return undefined
  }
  static getSpellId(key) {
    let token = this.beneosSpells[key]
    if (token) {
      //console.log("Spell ?", token)
      return token.spellId
    }
    return undefined
  }
  /********************************************************************************** */
  static getAnimatedTokens(token) {
    //console.log("TOKEN: ", token)
    let tokenData = this.getTokenImageInfo(token)
    let tokenList = []

    if (tokenData?.fullKey) {
      let tokenConfig = this.beneosTokens[tokenData.fullKey]
      if (tokenConfig.imgVideoList) {
        for (let imgVideo of tokenConfig.imgVideoList) {
          if (imgVideo.includes("top") && imgVideo.includes(".webm")) {
            let modeName = imgVideo.match("-([\\w_]*).web")
            modeName = this.firstLetterUpper(modeName[1].replace(/_/g, ", "))
            tokenList.push({
              isVideo: imgVideo.includes("webm"),
              token: imgVideo, //this.getFullPathWithSlash() + fullKey + '/' + fullKey + "-idle_face_still.webp",
              name: modeName, tokenvideo: imgVideo
            })
          }
        }
      }
    }
    return tokenList
  }

  /********************************************************************************** */
  static getScaleFactor(token, newImage = undefined) {
    return 1;
  }

  /********************************************************************************** */
  static async forceChangeToken(tokenid, fullKey) {
    let token = BeneosUtility.getToken(tokenid)
    if (token === null || token == undefined) {
      return
    }
    let tokenData = BeneosUtility.getTokenDataFromKey(fullKey)
    let newImage = tokenData.token
    console.log(">>>>>>>>>>>", token)
    token.document.setFlag(BeneosUtility.moduleID(), "fullKey", tokenData.fullKey)
    let scaleFactor = this.getScaleFactor(token, fullKey)
    //console.log(">>>>>>>>>>> UPDATE TOKEN CHANGE", fullKey, tokenData, newImage)
    await token.document.update({ img: newImage, scale: scaleFactor, rotation: 1.0 })
    if (foundry.utils.isNewerVersion(game.version, "11")) {
      await token.document.update({ 'texture.src': newImage })
    }
    //canvas.scene.updateEmbeddedDocuments("Token", [({ _id: token.id, img: finalimage, scale: 1.0, rotation: 0 })])
    let actor = token.actor
    if (actor && actor.type == "character") {
      let actorImage = tokenData.avatar
      actor.update({ 'token.img': actorImage })
    }
    return
  }

  /********************************************************************************** */
  static delayDetectEnd(token) {
    token.detectEnd = true
    setTimeout(function () { BeneosUtility.detectMoveEnd(token) }, 800)
  }

  /********************************************************************************** */
  static processEndEffect(tokenId, animeInfo) {
    BeneosUtility.debugMessage("[BENEOS MODULE] Effect END ! ", animeInfo[0].tmFilterId)
    let token = canvas.tokens.placeables.find(t => t.id == tokenId)
    for (let a of animeInfo) {
      token.TMFXdeleteFilters(a.tmFilterId)
    }
    // Manage state change
    if (token.state == "heal" || token.state == "hit" || token.state == "action") {
      setTimeout(function () {
        BeneosUtility.updateToken(tokenId, { forceupdate: true });
      }, 20)
    }
  }

  /********************************************************************************** */
  // Main function that allows to control the automatic animations and decide which animations has to be shown.
  static updateToken(tokenid, BeneosExtraData) {

    let token = BeneosUtility.getToken(tokenid)
    if (!token || !BeneosUtility.checkIsBeneosToken(token) || !token.document.texture.src) {
      BeneosUtility.debugMessage("[BENEOS MODULE] Not Beneos/No image")
      return
    }

    let actorData = token.actor
    if (!actorData || actorData.flags.world.beneos == undefined) {
      return
    }
    let fullKey = actorData.flags.world.beneos.fullId
    let myToken = BeneosUtility.getTokenDataFromKey(fullKey)
    if (!myToken) {
      BeneosUtility.debugMessage("[BENEOS MODULE] Config not found " + fullKey)
      return
    }

    let attributes = actorData.system.attributes
    if (!attributes) {
      BeneosUtility.debugMessage("[BENEOS MODULE] No attributes", actorData)
      return
    }
    console.log("Token HP value", fullKey, myToken)
    let hp = attributes.hp.value
    let benRotation = 0
    let benAlpha = 1
    if (!game.dnd5e || hp == undefined) {
      BeneosUtility.debugMessage("[BENEOS MODULE] No hp")
      return
    }

    if (hp == 0 && hp != BeneosUtility.beneosHealth[token.id]) {
      BeneosUtility.debugMessage("[BENEOS MODULE] Dead")
      token.state = "dead"
      // TODO : apply grey FX ?
      BeneosUtility.applyDeadFX(token)
    }
    if (BeneosUtility.beneosHealth[token.id] == 0 && hp > 0) {
      BeneosUtility.debugMessage("[BENEOS MODULE] Standing")
      token.state = "standing"
      TokenMagic.deleteFilters(token);
    }
    BeneosUtility.beneosHealth[token.id] = hp // Store current HP value
  }

  /********************************************************************************** */
  // Function to force update the renewal of beneos tokens in a scene.
  static updateSceneTokens() {
    for (let i in canvas.tokens.placeables) {
      let token = canvas.tokens.placeables[i];
      if (token !== undefined && ("id" in token)) {
        this.preloadToken(token)
        BeneosUtility.debugMessage("[BENEOS MODULE] Force updating " + token.id)
        /*this.updateToken(token.id, "standing", { forceupdate: true })*/
      }
    }
  }

  /********************************************************************************** */
  static checkLockViewPresence()  {
    let lv = game.modules.get("LockView")
    if (lv?.active) {
      ui.notifications.warn("Lock View module detected. Beneos Module is no more compatible with LockView module, it must be de-activated.")
      return true
    }
  }

  /********************************************************************************** */
  static processCanvasReady() {
    for (let [key, token] of canvas.scene.tokens.entries()) {
      if (BeneosUtility.checkIsBeneosToken(token)) {
        let tokenData = BeneosUtility.getTokenImageInfo(token.texture.src)
        let tokenConfig = this.beneosTokens[tokenData.fullKey]
        if (typeof tokenConfig === 'object' && tokenConfig) {
          BeneosUtility.updateToken(token.id, {})
        }
      }
    }
  }

  /* -------------------------------------------- */
  static sortArrayObjectsByName(myArray) {
    myArray.sort((a, b) => {
      let fa = a.actorName?.toLowerCase() || "";
      let fb = b.actorName?.toLowerCase() || "";
      if (fa < fb) {
        return -1;
      }
      if (fa > fb) {
        return 1;
      }
      return 0;
    })
  }
 
  /********************************************************************************** */
  static getVariants(tokenConfig) {
    let familyId = tokenConfig.familyId
    let variants = []
    Object.entries(BeneosUtility.beneosTokens).forEach(([key, value]) => {
      if (value.familyId == familyId && value.fullId != tokenConfig.fullId) {
        let number = value.number || ""
        variants.push({ "display_name": value.actorName + " " + number, "img": value.token, "name": key, fullId: value.fullId  })
      }
    })
    return variants
  }
 
  /********************************************************************************** */
  static buildAvailableTokensMenu() {
    let beneosTokensHUD = []

    Object.entries(BeneosUtility.beneosTokens).forEach(([key, value]) => {
      if (value?.actorName && value?.actorId) {
        beneosTokensHUD.push({
          "fullKey": key, //BeneosUtility.getBasePath() + BeneosUtility.getBeneosTokenDataPath() + "/" + key + '/' + key + "-idle_face_still.webp",
          "img": value.avatar,
          "actorId": value.actorId,
          "actorName": value.actorName
        })
      } else {
        ui.notifications.warn("Beneos Module: Actor name/id not found for token " + key)
      }
    })
    this.sortArrayObjectsByName(beneosTokensHUD)
    //console.log("Beneos Tokens HUD", beneosTokensHUD)
    return beneosTokensHUD
  }

  /********************************************************************************** */
  static async buildAvailableTokensMenuHTML(template, beneosTokensHUD) {
    const beneosTokensDisplay = await renderTemplate('modules/beneos-module/templates/' + template,
      { beneosBasePath: BeneosUtility.getBasePath(), beneosDataPath: BeneosUtility.getBeneosTokenDataPath(), beneosTokensHUD })

    return beneosTokensDisplay
  }

  /********************************************************************************** */
  static manageAvailableTokensMenu(token, html, event) {
    let beneosClickedButton = event.target.parentElement
    let beneosTokenButton = html.find('.beneos-token-hud-action')[0]

    if (beneosClickedButton === beneosTokenButton) {
      beneosTokenButton.classList.add('active')
      html.find('.beneos-selector-wrap')[0].classList.add('beneos-active')
      html.find('.beneos-selector-wrap')[0].classList.remove('beneos-disabled')
    } else {
      beneosTokenButton.classList.remove('active')
      html.find('.beneos-selector-wrap')[0].classList.remove('beneos-active')
      html.find('.beneos-selector-wrap')[0].classList.add('beneos-disabled')
      if (beneosClickedButton.classList.contains("beneos-button-token")) {
        event.preventDefault()
        let fullKey = beneosClickedButton.dataset.fullkey
        setTimeout(function () {
          BeneosUtility.forceChangeToken(token.id, fullKey)
        }, 200)
      }
    }
  }

  /********************************************************************************** */
  static async saveJSONConfig(fullKey) {
    let tokenConfig = this.beneosTokens[fullKey]
    if (tokenConfig) {
      let jsonData = {}
      jsonData[fullKey] = {
        config: foundry.utils.duplicate(tokenConfig.config),
        top: foundry.utils.duplicate(tokenConfig.top)
      }
      let json = JSON.stringify(jsonData)
      saveDataToFile(json, "text/json", tokenConfig.JSONFilePath)
    }
  }
}
