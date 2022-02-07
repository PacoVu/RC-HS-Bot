const RingCentral = require('@ringcentral/sdk').SDK
const { Service } = require('ringcentral-chatbot/dist/models')

const findService = async (botId, userId) => {
  const service = await Service.findOne({ where: { name: 'RingCentral', botId: botId, userId: userId } })
  return service
}



function RCPlatform(extensionId, botId) {
  this.extensionId = extensionId
  this.botId = botId
  var cachePrefix = `user_${extensionId}`
  this.rcsdk = new RingCentral({
      cachePrefix: cachePrefix,
      server: process.env.RINGCENTRAL_APP_SERVER,
      clientId: process.env.RINGCENTRAL_APP_CLIENT_ID,
      clientSecret:process.env.RINGCENTRAL_APP_CLIENT_SECRET,
      redirectUri: process.env.RINGCENTRAL_APP_REDIRECT_URL,
    })

  this.platform = this.rcsdk.platform()
  this.platform.on(this.platform.events.loginSuccess, this.loginSuccess)
  this.platform.on(this.platform.events.logoutSuccess, this.logoutSuccess)
  this.platform.on(this.platform.events.refreshError, this.refreshError)

  var boundFunction = ( async function() {
      console.log("WONDERFUL")
      console.log(this.extensionId);
      //this.updateUserAccessTokens()
  }).bind(this);
  this.platform.on(this.platform.events.refreshSuccess, boundFunction);

  return this
}

RCPlatform.prototype = {
  createLoginUrl: async function(){
    var loginUrl = await this.platform.loginUrl({
          brandId: process.env.RINGCENTRAL_BRAND_ID,
          redirectUri: process.env.RINGCENTRAL_APP_REDIRECT_URL,
          state: `${this.botId}:${this.extensionId}`
        })
    return loginUrl
  },
  login: async function(code){
    try{
      var resp = await this.rcsdk.login({
        code: code,
        redirectUri: process.env.RINGCENTRAL_APP_REDIRECT_URL
      })
      //var tokenObj = await resp.json()
      //this.extensionId = tokenObj.owner_id
      //await this.updateUserAccessTokens()
      //return  tokenObj
      var tokenObj = await this.platform.auth().data()
      console.log("tokenObj", tokenObj)
      this.extensionId = tokenObj.owner_id
      return  tokenObj
    }catch(e){
      console.log('PLATFORM LOGIN ERROR ' + e.message || 'Server cannot authorize user');
      return null
    }
  },
  /*
  autoLogin: async function(){
    const service = await findService(this.botId, this.extensionId)
    //console.log("service", service)
    if (service){
      if (!service.dataValues.data.rc_access_tokens)
        return null
      this.extensionId = service.dataValues.data.rc_access_tokens.owner_id
      this.platform.auth().setData(service.dataValues.data.rc_access_tokens)
      if (await this.platform.loggedIn()){
        console.log("Auto login ok")
        return service.dataValues.data
      }else{
        console.log("Auto-login failed: BOTH TOKEN TOKENS EXPIRED")
        return null
      }
    }else
      return null
  },*/
  logout: async function(){
    console.log("logout from platform engine")
    const service = await findService(this.botId, this.extensionId)
    if (service) {
      console.log("deleting")
      //service.destroy()
      var userDataObj = service.data
      userDataObj.access_tokens = null
      Service.update({ data: userDataObj }, {where: {name: 'RingCentral', botId: this.botId, userId: this.extensionId} })
      console.log("deleted")
    }
    await this.platform.logout()
  },
  getPlatform: async function(){
    console.log("getPlatform")
    if (await this.platform.loggedIn()){
      console.log("Logged in?")
      return this.platform
    }else{
      console.log("BOTH TOKEN TOKENS EXPIRED")
      console.log("CAN'T REFRESH")
      return null
    }
  },
  isLoggedIn: async function(tokenObj){
    this.platform.auth().setData(tokenObj)
    const ret = await this.platform.loggedIn()
    if (ret){
        console.log("Is logged in")
        var tokenObj = await this.platform.auth().data()
        return tokenObj
    }else{
      console.log("Auto-login failed: BOTH TOKEN TOKENS EXPIRED")
      return null
    }
  },
  /*
  updateUserAccessTokens: async function() {
    console.log("updateUserAccessTokens")
    var tokenObj = await this.platform.auth().data()
    var tokenStr = JSON.stringify(tokenObj)
    //userDataObj.access_tokens = tokenObj
    //console.log(tokenStr)
    console.log(this.botId)
    console.log(this.extensionId)
    const service = await findService(this.botId, this.extensionId)
    if (service === null) {
      console.log("CREATE TOKENS")
      var userDataObj = require('./userDataObj.js')
      userDataObj.rc_access_tokens = tokenObj
      Service.create({ name: 'RingCentral', botId: this.botId, userId: this.extensionId,  data: userDataObj })
    } else {
      console.log("UPDATE TOKENS")
      var userDataObj = service.data
      //var userDataObj = require('./userDataObj.js')
      userDataObj.rc_access_tokens = tokenObj
      Service.update({ data: userDataObj }, {where: {name: 'RingCentral', botId: this.botId, userId: this.extensionId} })
    }
  },
  */
  // for testing
  loginSuccess: function(e){
    console.log("Login success")
    //console.log(e)
    //this.updateUserAccessTokens()
  },
  logoutSuccess: function(e){
    console.log("logout Success")
  },
  beforeRefresh: function(e){
    console.log("before Refresh")
  },
  refreshSuccess: function(e){
    console.log("refresh Success")
    //this.updateUserAccessTokens()
  },
  refreshError: function(e){
    console.log("refresh Error")
    console.log("Error " + e.message)
  }
}

module.exports = RCPlatform;
