var fs = require('fs')
//var async = require("async");
const RCPlatform = require('./platform.js')
//const EventHandler = require('./event-engine.js')
const HS = require('./hubspot-crm.js')
//const pgdb = require('./db')
/*
const sqlite3 = require('sqlite3').verbose();
var CALLREPORTING_DATABASE = './db/callreporting.db';
let db = new sqlite3.Database(CALLREPORTING_DATABASE);
*/


const { Service, Bot } = require('ringcentral-chatbot/dist/models')

const findService = async (botId, userId) => {
  const service = await Service.findOne({ where: { name: 'RingCentral', botId: botId, userId: userId } })
  return service
}

const updateService = async (botId, extensionId, data) => {
  await Service.update({ data: data }, {where: { name: 'RingCentral', botId: botId, userId: extensionId } })
}


const HS_LEAD_STATUSES = [
  { title: "N/A", value: "" },
  { title: "New", value: "NEW" },
  { title: "Open", value: "OPEN" },
  { title: "In Progress", value: "IN_PROGRESS" },
  { title: "Open deal", value: "OPEN_DEAL" },
  { title: "Unqualified", value: "UNQUALIFIED" },
  { title: "Attempted to contact", value: "ATTEMPTED_TO_CONTACT" },
  { title: "Connected", value: "CONNECTED" },
  { title: "Bad timing", value: "BAD_TIMING" },
  { title: "Unassigned", value: "UNASSIGNED" }
  ]


function User(bot, groupId, extensionId, botId, activeCalls) {
  this.activeCalls = activeCalls
  this.bot = bot
  this.botId = botId
  this.groupId = groupId
  this.extensionId = extensionId;

  this.rc_platform = new RCPlatform(extensionId, botId)
  this.hubspot_platform = new HS.HubSpot()
  this.userDataObj = undefined

  var offset = new Date().getTimezoneOffset();
  this.utcOffset = offset * 60000
  return this
}

function makeLoginCard(title, url){
  return {
    type: "Action.OpenUrl",
    title: title,
    url: url
  }
}

function makeLogoutCard(title, path, botId){
  return {
    type: "Action.Submit",
    title: title,
    data: {
      path: path,
      bot_id: botId
    }
  }
}

var engine = User.prototype = {
  handleLogout: async function (){
    var rcLogin = undefined
    var hsLogin = undefined
    var message = 'Click the buttons below to login.'
    if (!this.userDataObj.rc_access_tokens){
      var loginUrl = await this.rc_platform.createLoginUrl()
      rcLogin = makeLoginCard("Login RingCentral", loginUrl)
    }else{
      message = "You are currently logged in."
      rcLogin = makeLogoutCard("Logout RingCentral", "logout_rc", this.bot.id)
    }

    // HubSpot
    if (!this.userDataObj.hs_access_tokens){
      this.userDataObj.hubspotCallDisposition = null
      var loginUrl = this.hubspot_platform.getLoginUrl(`${this.botId}:${this.extensionId}`)
      hsLogin = makeLoginCard("Login HubSpot", loginUrl)
    }else{
      hsLogin = makeLogoutCard("Logout HubSpot", "logout_hs", this.botId)
    }

    var loginCard = {
      type: "AdaptiveCard",
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      version: "1.3",
      body: [
        {
          type: "TextBlock",
          text: "RingCentral and HubSpot authentication"
        }
      ],
      actions: [
        rcLogin,
        hsLogin
      ]
    }
    if (this.userDataObj.loginCardId != ''){
        console.log("Update card", loginCard)
        await this.bot.updateAdaptiveCard(this.userDataObj.loginCardId, loginCard)
    }else {
        var ret = await this.bot.sendAdaptiveCard(this.groupId, loginCard)
        this.userDataObj.loginCardId = ret.id
        this.userDataObj.groupId = this.groupId
    }

    await this.updateUserData()
    // check
    console.log("saved userDataObj", this.userDataObj)
   },
   handleLogin: async function (update, command){
      if (!this.userDataObj)
        this.userDataObj = await this.readUserData()
      console.log("userDataObj", this.userDataObj)
      var rcLogin = undefined
      var hsLogin = undefined
      var message = 'Click the buttons below to login.'

      // HubSpot
      try {
        if (!this.userDataObj.hs_access_tokens){
          var loginUrl = this.hubspot_platform.getLoginUrl(`${this.botId}:${this.extensionId}`)
          hsLogin = makeLoginCard("Login HubSpot", loginUrl)
        }else{
          if (!this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)){
            this.userDataObj.hs_access_tokens = await this.hubspot_platform.refreshTokens()
            this.updateUserData()
          }
          //this.userDataObj.hs_access_tokens = await this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)
          if (this.userDataObj.hs_access_tokens){
            if (!command){
              console.log("Continue")
              return 'Continue'
            }
            console.log("hs_access_tokens", this.userDataObj.hs_access_tokens)
            hsLogin = makeLogoutCard("Logout HubSpot", "logout_hs", this.botId)
            if (!this.userDataObj.hubspotCallDisposition)
               await this.readHubSpotCallDisposition()
           }else{
             var loginUrl = this.hubspot_platform.getLoginUrl(`${this.botId}:${this.extensionId}`)
             hsLogin = makeLoginCard("Login HubSpot", loginUrl)
           }
        }
      }catch(e){
        console.log("TEST CATCH")
        console.log(e)
        var loginUrl = this.hubspot_platform.getLoginUrl(`${this.botId}:${this.extensionId}`)
        hsLogin = makeLoginCard("Login HubSpot", loginUrl)
        //return
      }

      if (!this.userDataObj.rc_access_tokens){
        var loginUrl = await this.rc_platform.createLoginUrl()
        rcLogin = makeLoginCard("Login RingCentral", loginUrl)
      }else{
          /*
          this.userDataObj.rc_access_tokens = await this.rc_platform.isLoggedIn(this.userDataObj.rc_access_tokens)
          if (this.userDataObj.rc_access_tokens){
            if (command == 'login' || command == 'logout'){
              message = "You are currently logged in."
                // temp solution
                //console.log("Temp solution")
                //await this.handleNotification()
              rcLogin = makeLogoutCard("Logout RingCentral", "logout_rc", this.bot.id)
            }else{
              await this.updateUserData()
              return 'Continue'
            }
          }else{
            console.log("both tokens expired!")
            var loginUrl = await this.rc_platform.createLoginUrl()
            rcLogin = makeLoginCard("Login RingCentral", loginUrl)
          }
          */
          message = "You are currently logged in."
          rcLogin = makeLogoutCard("Logout RingCentral", "logout_rc", this.bot.id)
      }

      var loginCard = {
         type: "AdaptiveCard",
         $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
         version: "1.3",
         body: [
           {
             type: "TextBlock",
             text: "RingCentral and HubSpot authentication"
           }
         ],
         actions: [
           rcLogin,
           hsLogin
         ]
      }
      if (!update){
          console.log("new auth card card")
          var ret = await this.bot.sendAdaptiveCard(this.groupId, loginCard)
          this.userDataObj.loginCardId = ret.id
          this.userDataObj.groupId = this.groupId
      }else{
          console.log("UPDATE LOGIN CARD", this.userDataObj)
          if (this.userDataObj.loginCardId != ''){
              console.log("Update card", loginCard)
            await this.bot.updateAdaptiveCard(this.userDataObj.loginCardId, loginCard)
          }else {
            var ret = await this.bot.sendAdaptiveCard(this.groupId, loginCard)
            this.userDataObj.loginCardId = ret.id
            this.userDataObj.groupId = this.groupId
          }
      }
      //this.activeCalls = []
      //this.userDataObj.hubspotCallDisposition = null
      //await this.handleNotification()
      await this.updateUserData()
      // check
      //console.log("saved userDataObj", this.userDataObj)
      return null
    },
    // test auto post
    handleNotification: async function(){
      this.userDataObj.rc_access_tokens = await this.rc_platform.isLoggedIn(this.userDataObj.rc_access_tokens)
      await this.deleteAllRegisteredWebHookSubscriptions()
      //await this.subscribeForTelephonySessionNotification()
    },
    _updateAdaptiveCard: async function(cardId, card){
      console.log("_updateAdaptiveCard")
      await this.bot.updateAdaptiveCard(cardId, card)
    },
    _sendNewAdaptiveCard: async function(groupId, card){
      console.log("_sendNewAdaptiveCard")
      await this.bot.sendAdaptiveCard(groupId, card)
    },
    processNotification: async function(body, userDataObj){
      /*
      console.log("ooooooooo")
      console.log(this.activeCalls)
      console.log("ooooooooo")
      */
      var call = undefined

      var party = body.parties[0]
      console.log(party)

      if(party.status.code == "Setup"){
        // check and change
        console.log("Ignore call in Setup stage")
        return
      }

      /*
      else{
        if ((party.direction == "Inbound" && party.from.hasOwnProperty('extensionId')) ||
            (party.direction == "Outbound" && party.to.hasOwnProperty('extensionId'))
          ){
            console.log("Ignore internal call.")
            return
        }
      }
      */
      this.userDataObj = userDataObj //await this.readUserData()
      this.groupId = this.userDataObj.groupId
      if (!this.groupId){
        console.log("force to login or reinstall the bot")
        return
      }

      if (party.extensionId){
        call = this.activeCalls.find(o => o.partyId === party.id)
        if (call){
          var timestamp = new Date(body.eventTime).getTime()
          if(party.status.code == "Setup"){
            if (call.status == "RINGING"){ // most probably a disorder sequence
              call.callTimestamp = timestamp
            }
          }else if (party.status.code == "Proceeding"){
            call.ringTimestamp = timestamp
            //call.localRingTimestamp = new Date().getTime()
            call.status = "RINGING"
            if (party.direction == "Inbound"){
              if (party.from)
                call.customerNumber = party.from.phoneNumber
              if (party.to)
                call.agentNumber = party.to.phoneNumber
            }else{ // outbound
              call.customerNumber = party.to.phoneNumber
              call.agentNumber = party.from.phoneNumber
            }
            //await this.updateUserData()
          }else if(party.status.code == "Answered"){
            if (call.status == "HOLD"){
              var holdDuration = Math.round((timestamp - call.holdTimestamp) / 1000)
              call.callHoldDurationTotal += holdDuration
            }else{
              if (/*call.direction == "Inbound" && */call.status == "RINGING"){
                call.connectTimestamp = timestamp
                //call.localConnectTimestamp = new Date().getTime()
                var respondTime = (call.connectTimestamp - call.ringTimestamp) / 1000
                call.callRingDuration = Math.round(respondTime)
              }else if (call.status == "CONNECTED"){
                if (party.hasOwnProperty('recordings') && party.recordings[0].active){
                  console.log(party.recordings)
                  call.recording.id = party.recordings[0].id
                }else
                  console.log("No recording")
              }
            }
            call.status = "CONNECTED"
            // test intermediate notes
            console.log("CALLING THIS FROM HERE")
            this.updateActiveCallCard(call)

            console.log("Check point 1")
            console.log(call)
            console.log("+++++++++")
            console.log(this.activeCalls)
            console.log("Check point 1 end")
          }else if(party.status.code == "Disconnected"){
            console.log("Agent's disconnected event")
            //console.log(call.status)
            console.log(body)
            if (call.status == "NO-CALL"){
              console.log("Already handled disconnection when customer hanged up => return")
              return
            }else{
              call.disconnectTimestamp = timestamp
              await this.handleDisconnection(call, party, agentHangedup=true)
              await this.updateActiveCallCard(call)
            }
          }else if(party.status.code == "Voicemail"){
            call.status = "VOICEMAIL"
          }else if(party.status.code == "Hold"){
            call.holdTimestamp = timestamp
            //call.localHoldTimestamp = new Date().getTime()
            call.status = "HOLD"
            call.holdCount++
          }else if (party.status.code == 'Gone'){
            // Warm transfer
            console.log("Agent's made warm transfer event")
            //console.log(body)
            if (call.status == "HOLD")
              console.log("Already handled disconnection when customer hanged up => return")

            call.disconnectTimestamp = timestamp
            await this.handleDisconnection(call, party, agentHangedup=true)
            await this.updateActiveCallCard(call)
          }
        }else{
          // Detect internal calls
          if ((party.direction == "Inbound" && party.from.hasOwnProperty('extensionId')) ||
              (party.direction == "Outbound" && party.to.hasOwnProperty('extensionId'))
            ){
              console.log("No Call object. Ignore internal call.")
              return
          }

          var index = this.activeCalls.findIndex(o => o.status === "NO-CALL")
          if (index >= 0){
            console.log("Reuse old active call")
            call = this.createNewActiveCall(body, party, this.activeCalls)
            this.activeCalls[index] = call
            console.log(this.activeCalls.length)
          }else{
            if (party.status.code == 'Disconnected'){
              console.log('Call has terminated and active call was deleted. Extra event => IGNORE')
              return
            }
            console.log("Add new active call")
            call = this.createNewActiveCall(body, party, this.activeCalls)
            this.activeCalls.push(call)
            //await this.updateUserData()
          }
          await this.sendNewActiveCallCard(call)
        }
      }else{
        call = this.activeCalls.find(o => o.sessionId === body.sessionId)
        if (call != undefined){
          if (party.status.code == "Disconnected"){
            console.log("Customer hanged up")
            console.log(body)
            if (call.status == "NO-CALL"){
              console.log("Already handled disconnection when agent hanged up => return")
              return
            }else{
              call.disconnectTimestamp = new Date(body.eventTime).getTime()
              await this.handleDisconnection(call, party, agentHangedup=false)
              await this.updateActiveCallCard(call)
            }
          }else if(party.status.code == "Parked"){
            call.status = "PARKED"
            if (party.park.id)
              call.parkNumber = party.park.id
          }else{
            console.log("Remote party event. IGNORE")
            return
          }
        }else{
          console.log("Remote party")
          return
        }
      }
      ///
      //console.log("Call status", party.status.code)
      if (call == undefined){
        console.log("Why call is undefined?????")
        return
      }
      console.log('===========')
      //await this.updateUserData()
    },
    createNewActiveCall: function (body, party, activeCalls) {
      console.log("createNewActiveCall")
      var call = {
                  cardId: '',
                  cCard: {},
                  sessionId: body.sessionId,
                  partyId: party.id,
                  customerNumber: "Anonymous",
                  agentNumber: "Unknown",
                  status: "NO-CALL",
                  direction: party.direction,
                  callTimestamp: 0,
                  ringTimestamp: 0,
                  connectTimestamp: 0,
                  disconnectTimestamp: 0,
                  holdTimestamp: 0,
                  callHoldDurationTotal: 0,
                  holdCount: 0,
                  callType: "",
                  callAction: "",
                  callResult: "",
                  parkNumber: "",
                  //localRingTimestamp: 0,
                  //localConnectTimestamp: 0,
                  //localHoldTimestamp: 0,
                  talkDuration: 0,
                  callRingDuration: 0,
                  //callHoldDuration: 0,
                  recording: {
                    uri: '',
                    id: '',
                    duration: 0
                  },
                  tempNotes: ''
                }
      var timestamp = new Date(body.eventTime).getTime()
      if (party.status.code == "Setup"){
        call.callTimestamp = timestamp
        call.status = "SETUP"
        if (party.direction == "Inbound"){
          if (party.from)
            call.customerNumber = party.from.phoneNumber
          if (party.to)
            call.agentNumber = party.to.phoneNumber
        }else{ // outbound
          call.customerNumber = party.to.phoneNumber
          call.agentNumber = party.from.phoneNumber
        }
      }else if (party.status.code == "Proceeding"){
        // This happens when there is an incoming call to a call queue
        // Need to deal with incoming calls to a call queue, where queue's members do not receive their own setup event!!!
        // Set default callTimestamp with ringTimestamp for just in case there was no setup event
        call.callTimestamp = timestamp
        // get callTimestamp from an active call with the same sessionId
/*
          for (c of activeCalls){
            if (body.sessionId == c.sessionId){
              call.callTimestamp = c.callTimestamp
              break
            }
          }
*/
        call.ringTimestamp = timestamp
        call.status = "RINGING"
        if (party.direction == "Inbound"){
          if (party.from)
            call.customerNumber = party.from.phoneNumber
          if (party.to)
            call.agentNumber = party.to.phoneNumber
        }else{ // outbound
          call.customerNumber = party.to.phoneNumber
          call.agentNumber = party.from.phoneNumber
        }
      }else if (party.status.code == "Answered"){
        call.connectTimestamp = timestamp
        call.status = "CONNECTED"
        if (party.direction == "Inbound"){
          if (party.from)
            call.customerNumber = party.from.phoneNumber
          if (party.to)
            call.agentNumber = party.to.phoneNumber
        }else{ // outbound
          call.customerNumber = party.to.phoneNumber
          call.agentNumber = party.from.phoneNumber
        }
      }else if (party.status.code == "Disconnected"){
        call.disconnectTimestamp = timestamp
        call.status = "NO-CALL"
      }
      // detect call type from call queue
      call.callType = body.origin.type
      if (party.uiCallInfo) // override callType if this call is from a call queue
        if (party.uiCallInfo.primary.type  == "QueueName")
          call.callType = "Queue"

      return call
    },
    handleDisconnection: async function(call, party, agentHangedup){
      if (call.status == "CONNECTED"){ // call was connected
        if(agentHangedup)
          call.callResult = "Agent hanged up."
        else
          call.callResult = "Customer hanged up."

        //  status: { code: 'Disconnected', reason: 'BlindTransfer', rcc: false },
        if (party.status.reason == 'BlindTransfer')
          call.callResult = "Agent made a blind transfer."
        else if (party.status.code == 'Gone' && party.status.reason == 'AttendedTransfer')
          call.callResult = "Agent made a warm transfer."
        call.callAction = "Connected"
      }else if (call.status == "HOLD"){
        if(agentHangedup)
          call.callResult = "Agent hanged up during on-hold."
        else
          call.callResult = "Customer hanged up during on-hold."
        call.callAction = "Connected"
        call.callHoldDurationTotal += (call.disconnectTimestamp - call.holdTimestamp) / 1000
      }else if (call.status == "RINGING"){ // missed call
        if (call.direction == 'Inbound'){
          call.callAction = "Missed Call"
          call.callResult = "Missed call"
        }else{
          call.callAction = "Cancelled"
          call.callResult = "Cancelled"
        }
      }else if (call.status == "VOICEMAIL"){ // to voicemail
        call.callAction = "Voicemail"
        call.callResult = "Voicemail."
      }else if (call.status == "SETUP"){
        call.callAction = "Cancelled"
        call.callResult = "Call was cancelled"
      }else if (call.status == "PARKED"){
        call.callAction = "Parked"
        call.callResult = `Call was parked. Parking number ${call.parkNumber}`
      }else{
        call.callAction = "Unknown"
        call.callResult = "Unknown call result."
      }
      if (call.connectTimestamp > 0){
        call.talkDuration = (Math.round(call.disconnectTimestamp - call.connectTimestamp) / 1000) - call.callHoldDurationTotal
      }else{
        call.callRingDuration = (Math.round(call.disconnectTimestamp - call.ringTimestamp) / 1000)
        console.log("FINAL CALL RING DURATION", call.callRingDuration)
      }
      call.status = "NO-CALL"
      /*
      if (call.recording.id != ''){
        ///
        var thisUser = this
        setTimeout(function(){
          thisUser.getRecordingUrl(call)
        }, 30000, call)
        ///
        var resp = await this.getRecordingUrl(call.recording.id)
        console.log(resp)
        if (resp){
          call.recording.uri = resp.contentUri
          call.recording.duration = resp.duration
        }
      }
      */
    },
    sendNewActiveCallCard: async function(call){
      console.log("sendNewActiveCallCard")
      //var cCard = undefined
      var dateTime = new Date(call.callTimestamp - this.utcOffset).toISOString().substr(5, 14).replace('T', ' at ')

      var params = this.createCardHeader(call)

      var cTitle = (call.direction == "Inbound") ? "Unknown caller" : "New customer"
      var cCard = {
        title: cTitle,
        customer: false
      }

      // Add HubSpot contact info
      if (this.userDataObj.hs_access_tokens){
        if (!this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)){
          this.userDataObj.hs_access_tokens = await this.hubspot_platform.refreshTokens()
          await this.updateUserData()
        }
        //this.userDataObj.hs_access_tokens = await this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)
        if (this.userDataObj.hs_access_tokens){
          var number = call.customerNumber.substr(2, 10)
          var query = {
            q: number
          }
          var response = await this.hubspot_platform.get('/contacts/v1/search/query', query)
          //console.log(response)
          var jsonObj = JSON.parse(response)
          console.log(jsonObj)
          if (jsonObj && jsonObj.contacts.length){
            //console.log("HAS CONTACTS")
            cCard = {
              title: "Contact Info",
              customer: true,
              contactId: jsonObj.contacts[0].vid,
              portalId: jsonObj.contacts[0]['portal-id'],
              card: this.createCustomerCard(jsonObj.contacts[0])
            }
          }else{
            console.log("NO CONTACTS")
            var cTitle = (call.direction == "Inbound") ? "Unknown caller" : "New customer"
            cCard = {
              title: cTitle,
              customer: false,
              card: this.createNewCustomerCard(call.customerNumber)
            }
          }

          if (cCard){
            // add block
            var detailedLink = undefined
            if (cCard.portalId){
              detailedLink = {
                    type: "Action.OpenUrl",
                    title: 'View contact details',
                    url: `https://app.hubspot.com/contacts/${cCard.portalId}/contact/${cCard.contactId}`
                  }
            }

            params.body.push({
                type: "TextBlock",
                separator: true,
                size: "Large",
                color: 'good',
                weight: "Bolder",
                text: cCard.title
              })

            params.body.push(cCard.card)
          }

          if (cCard.customer){
            params.body.push({
                type: "ActionSet",
                actions: [
                  {
                    type: "Action.Submit",
                    title: "Update Contact",
                    data: {
                      path: "update_contact",
                      contact_id: jsonObj.contacts[0].vid,
                      bot_id: this.botId
                    }
                  },
                  detailedLink
                ]
              })
          }
          console.log(JSON.stringify(params))
        }
      }
      call.cCard = cCard
      //console.log("====Thid call====")
      //console.log(call)
      var ret = await this.bot.sendAdaptiveCard(this.groupId, params)
      call.cardId = ret.id
      console.log("====All active calls====")
      console.log(this.activeCalls)
    },
    updateActiveCallCard: async function(call){
      console.log("updateActiveCallCard")
      let customerCard = call.cCard
      var duration = call.talkDuration + call.callHoldDurationTotal
      var params = this.createCardHeader(call)
      // create call report card
      params.body.push({
        type: "TextBlock",
        size: "Large",
        color: 'good',
        weight: "Bolder",
        text: call.cCard.title
      })
      if (customerCard.card)
        params.body.push(customerCard.card)

      console.log('call.cCard', customerCard)
      if (customerCard.customer){
        var detailedLink = undefined
        if (customerCard.portalId){
          detailedLink = {
                type: "Action.OpenUrl",
                title: 'View contact details',
                url: `https://app.hubspot.com/contacts/${customerCard.portalId}/contact/${customerCard.contactId}`
          }
        }
        params.body.push(
          {
            type: "ActionSet",
            actions: [
              {
                type: "Action.Submit",
                title: "Update Contact",
                data: {
                  path: "update_contact",
                  contact_id: customerCard.contactId,
                  bot_id: this.botId
                }
              },
              detailedLink
            ]
          }
        )
      }
      if (call.status == "NO-CALL") {
        var rCard = undefined
        if (this.userDataObj.hubspotCallDisposition){
          rCard = this.createHubSpotReportCard(call)
        }else{
          console.log("No HS data")
          rCard = this.createPlainReportCard(call)
        }

        params.body.push({
          type: "TextBlock",
          separator: true,
          size: "Large",
          color: 'good',
          weight: "Bolder",
          text: 'Call Info'
        })
        params.body.push(rCard)

        if (call.cCard.customer){
          params.body.push({
            type: "ActionSet",
            actions: [
              {
                type: "Action.Submit",
                title: "Add call info to HubSpot",
                data: {
                  path: "add_call",
                  duration: duration * 1000,
                  timestamp: call.callTimestamp,
                  contact_id: call.cCard.contactId,
                  to_number: call.agentNumber,
                  from_number: call.customerNumber,
                  direction: call.direction,
                  recordingId: call.recording.id,
                  bot_id: this.botId
                }
              }
            ]
          })
        }
        //console.log("CHECK=======")
        //console.log(JSON.stringify(params))
        console.log("DONE=======")
        console.log(this.activeCalls)
        await this.bot.updateAdaptiveCard(call.cardId, params)
        this.activeCalls.splice(this.activeCalls.indexOf(call), 1)
      }else if (call.status == "CONNECTED"){
        if (call.cCard.customer){
          params.body.push(
            createTextBlock('Call in progress', true),
            createTitleTextBlock('Notes: (save notes before this call terminated)'),
              {
                  id: "temp_notes",
                  type: "Input.Text",
                  placeholder: "Take note and save immediately",
                  isMultiline: true,
                  value: ""
              }

          )
          params.body.push({
            type: "ActionSet",
            actions: [
              {
                type: "Action.Submit",
                title: "Save Notes",
                data: {
                  path: "save_notes",
                  bot_id: this.botId,
                  party_id: call.partyId
                }
              }
            ]
          })
          console.log("INTERMEDIATE=======")
          console.log(this.activeCalls)
          await this.bot.updateAdaptiveCard(call.cardId, params)
        }
      }
    },
    createCardHeader: function(call){
      var dateTime = new Date(call.callTimestamp - this.utcOffset).toISOString().substr(5, 14).replace('T', ' at ')
      var iconUrl = "http://www.qcalendar.com/icons/"
      var iconLink = (call.direction == "Inbound") ? `${iconUrl}IN-CALL.png`  : `${iconUrl}OUT-CALL.png`
      var title = (call.direction == "Inbound") ? 'Caller number: ' : 'Customer number:  '
      title += formatPhoneNumber(call.customerNumber)
      return params = {
        type: "AdaptiveCard",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        version: "1.3",
        body: [
          {
            type: "Container",
            items: [
              {
                type: "ColumnSet",
                columns: [
                  {
                    type: "Column",
                    width: "auto",
                    items: [
                      {
                        type: "Image",
                        height: "25px",
                        url: iconLink
                      }
                    ]
                  },
                  {
                    type: "Column",
                    width: "stretch",
                    items: [createTitleTextBlock(title)]
                  },
                  {
                    type: "Column",
                    width: "auto",
                    items: [createTextBlock(dateTime)]
                  }
                ]
              }
            ]
          }
        ]
      }
    },
    createPlainReportCard: function(call){
      var callAction = call.callAction

      var duration = formatDurationTime(call.talkDuration + call.callHoldDurationTotal)
      var ringDuration = formatDurationTime(call.callRingDuration)
      console.log("ringDuration ", ringDuration)
      var talkDuration = formatDurationTime(call.talkDuration)
      var holdDuration = formatDurationTime(call.callHoldDurationTotal)
      var recording = undefined
      var ringTimeTitle = (call.direction == "Inbound") ? ((call.connectTimestamp == 0 ) ? "Ring time:" : "Response time:") : "Ring time:"
      if (call.recording.id != ''){
        recording = {
          type: "ColumnSet",
          columns: [
            {
                type: "Column",
                width: "stretch",
                items: [createTextBlock('Call recorded.')]
            },
            {
                type: "Column",
                width: "stretch",
                items: [createTextBlock(`Recording Id: ${call.recording.id}`)]
            }
          ]
        }
      }
      var card = {
            type: "Container",
            items: [
                createTextBlock(`Call Result: ${call.callResult}`),
                {
                    type: "ColumnSet",
                    columns: [
                      {
                          type: "Column",
                          width: "stretch",
                          items: [createTextBlock('Duration')]
                      },
                      {
                          type: "Column",
                          width: "stretch",
                          items: [createTextBlock('Ring')]
                      },
                      {
                          type: "Column",
                          width: "stretch",
                          items: [createTextBlock('Talk')]
                      },
                      {
                          type: "Column",
                          width: "stretch",
                          items: [createTextBlock('Hold')]
                      }
                    ]
                },
                {
                    type: "ColumnSet",
                    columns: [
                      {
                          type: "Column",
                          width: "stretch",
                          items: [createValueBlock(duration)]
                      },
                      {
                          type: "Column",
                          width: "stretch",
                          items: [createValueBlock(ringDuration)]
                      },
                      {
                          type: "Column",
                          width: "stretch",
                          items: [createValueBlock(talkDuration)]
                      },
                      {
                          type: "Column",
                          width: "stretch",
                          items: [createValueBlock(holdDuration)]
                      }
                    ]
                },
                {
                    type: "ColumnSet",
                    columns: [
                        {
                            type: "Column",
                            width: "stretch",
                            items: [createTextBlock('Disposition:')]
                        },
                        {
                            type: "Column",
                            width: "stretch",
                            items: [createTextBlock(callAction)]
                        }
                    ]
                },
                createTextBlock(`${ringTimeTitle} ${ringDuration} - Talk time: ${talkDuration} - Hold time: ${holdDuration}\n`)
            ]
        }
        if (recording){
          card.items.unshift(recording)
        }
        return card
    },
    createHubSpotReportCard: function(call){
      var callAction = call.callAction
      var actionChoice = undefined
      if (this.userDataObj.hubspotCallDisposition){
        switch (call.callAction){
          case "Connected":
            var action = this.userDataObj.hubspotCallDisposition.find(o => o.title == call.callAction)
            if (action)
              callAction = action.value
            break
          case "Voicemail":
            var action = this.userDataObj.hubspotCallDisposition.find(o => o.title == "Left voicemail")
            if (action)
              callAction = action.value
            break
          case "Cancelled":
            var action = this.userDataObj.hubspotCallDisposition.find(o => o.title == "No answer")
            if (action)
              callAction = action.value
            break
          default:
            break
        }
      }

      var duration = formatDurationTime(call.talkDuration + call.callHoldDurationTotal)
      var ringDuration = formatDurationTime(call.callRingDuration)
      console.log("ringDuration ", ringDuration)
      var talkDuration = formatDurationTime(call.talkDuration)
      var holdDuration = formatDurationTime(call.callHoldDurationTotal)
      var recording = undefined
      //var ringTimeTitle = (call.direction == "Inbound") ? "Response time:" : "Ring time:"
      var ringTimeTitle = ''
      var callDirectionTitle = ''
      if (call.direction == "Inbound"){
        ringTimeTitle = (call.connectTimestamp == 0 ) ? "Ring time:" : "Response time:"
        callDirectionTitle = "Inbound call"
      }else{
        ringTimeTitle = (call.connectTimestamp == 0 ) ? "Wait time:" : "Ring time:"
        callDirectionTitle = "Outbound call"
      }
      if (call.recording.id != ''){
        recording = {
          type: "ColumnSet",
          columns: [
            {
                type: "Column",
                width: "stretch",
                items: [createTextBlock('Call recorded.')]
            },
            {
                type: "Column",
                width: "stretch",
                items: [createTextBlock(`recording Id: ${call.recording.id}`)]
            }
          ]
        }
      }
      var notesValue = `${callDirectionTitle}: ${ringTimeTitle} ${ringDuration} - Talk time: ${talkDuration} - Hold time: ${holdDuration}\n`
      if (call.tempNotes != '')
        notesValue += `${call.tempNotes}\n`
      var card = {
            type: "Container",
            items: [
                createTextBlock(`Call Result: ${call.callResult}`),
                {
                    type: "ColumnSet",
                    columns: [
                        {
                            type: "Column",
                            width: "stretch",
                            items: [createTextBlock('Disposition:')]
                        },
                        {
                            type: "Column",
                            width: "stretch",
                            items: [
                                {
                                    type: 'Input.ChoiceSet',
                                    id: 'call_disposition',
                                    style: "compact",
                                    isMultiSelect: false,
                                    value: callAction,
                                    choices: this.userDataObj.hubspotCallDisposition
                                }
                            ]
                        }
                    ]
                },
                {
                    type: "ColumnSet",
                    columns: [
                      {
                          type: "Column",
                          width: "stretch",
                          items: [createTextBlock('Duration')]
                      },
                      {
                          type: "Column",
                          width: "stretch",
                          items: [createTextBlock('Ring')]
                      },
                      {
                          type: "Column",
                          width: "stretch",
                          items: [createTextBlock('Talk')]
                      },
                      {
                          type: "Column",
                          width: "stretch",
                          items: [createTextBlock('Hold')]
                      }
                    ]
                },
                {
                    type: "ColumnSet",
                    columns: [
                      {
                          type: "Column",
                          width: "stretch",
                          items: [createValueBlock(duration)]
                      },
                      {
                          type: "Column",
                          width: "stretch",
                          items: [createValueBlock(ringDuration)]
                      },
                      {
                          type: "Column",
                          width: "stretch",
                          items: [createValueBlock(talkDuration)]
                      },
                      {
                          type: "Column",
                          width: "stretch",
                          items: [createValueBlock(holdDuration)]
                      }
                    ]
                },
                createTitleTextBlock('Notes:'),
                {
                    id: "notes",
                    type: "Input.Text",
                    placeholder: "Describe the call",
                    isMultiline: true,
                    value: notesValue
                }
            ]
        }
        if (recording){
          card.items.unshift(recording)
        }
        return card
    },
    createCustomerCard: function(contact){
      var lastName = (contact.properties.hasOwnProperty('lastname')) ? contact.properties.lastname.value : ""
      var firstName = (contact.properties.hasOwnProperty('firstname')) ? contact.properties.firstname.value : ""
      var jobTitle = (contact.properties.hasOwnProperty('jobtitle')) ? contact.properties.jobtitle.value : "N/A"
      var leadStatus = (contact.properties.hasOwnProperty('hs_lead_status')) ? contact.properties.hs_lead_status.value : ""
      var lifeCycleStage = (contact.properties.hasOwnProperty('lifecyclestage')) ? contact.properties.lifecyclestage.value : ""
      /*
      var ls = HS_LEAD_STATUS.find(l => l.value == leadStatus)
      if (ls){
        leadStatus = ls.value
      }
      */

      var email = (contact.properties.hasOwnProperty('email')) ? contact.properties.email.value : "N/A"
      var card = {
          type: "Container",
          items: [
              {
                  type: "ColumnSet",
                  columns: [
                      {
                          type: "Column",
                          width: "stretch",
                          items: [createTextBlock(`Name: ${lastName} ${firstName}`)]
                      },
                      {
                          type: "Column",
                          width: "stretch",
                          items: [createTextBlock(`Title: ${jobTitle}`)]
                      }
                  ]
              },
              {
                  type: "ColumnSet",
                  columns: [
                    {
                        type: "Column",
                        width: "auto",
                        items: [createTextBlock(`Email: ${email}`)]
                    }
                  ]
              },
              {
                  type: "ColumnSet",
                  columns: [
                    {
                        type: "Column",
                        width: "stretch",
                        items: [createTextBlock("Lead status:")]
                    },
                    {
                        type: "Column",
                        width: "stretch",
                        items: [
                            {
                                type: "Input.ChoiceSet",
                                id: "lead_status",
                                style: "compact",
                                isMultiSelect: false,
                                value: leadStatus,
                                choices: HS_LEAD_STATUSES
                            }
                        ]
                    }
                  ]
              },
              {
                  type: "ColumnSet",
                  columns: [
                    {
                        type: "Column",
                        width: "stretch",
                        items: [createTextBlock("Life cycle stage:")]
                    },
                    {
                        type: "Column",
                        width: "stretch",
                        items: [
                          {
                            type: "Input.ChoiceSet",
                            id: "life_cycle_stage",
                            style: "compact",
                            isMultiSelect: false,
                            value: lifeCycleStage,
                            choices: [
                              { title: "N/A", value: "" },
                              { title: "Subscriber", value: "subscriber" },
                              { title: "Lead", value: "lead" },
                              { title: "Marketing Qualified Lead", value: "mql" },
                              { title: "Sales Qualified Lead", value: "sql" },
                              { title: "Opportunity", value: "opportunity" },
                              { title: "Customer", value: "customer" },
                              { title: "Evangelist", value: "evangelist" }
                            ]
                          }
                        ]
                    }
                  ]
              }
          ]
      }
      return card
    },
    createNewCustomerCard: function(number){
      var lastName =  "Enter last name"
      var firstName = "Enter first name"
      var jobTitle = "Enter job title"
      var leadStatus = "Enter lead status"
      var email = "Enter email address"
      var card = {
          type: "Container",
          items: [
              {
                  type: "ColumnSet",
                  columns: [
                    {
                        type: "Column",
                        width: "auto",
                        items: [createTextBlock("Phone number")]
                    },
                    {
                        type: "Column",
                        width: "stretch",
                        items: [
                          {
                              type: "Input.Text",
                              id: "phone_number",
                              value: formatPhoneNumber(number)
                          }
                        ]
                    }
                  ]
              },
              {
                  type: "ColumnSet",
                  columns: [
                      {
                          type: "Column",
                          width: "stretch",
                          items: [
                              {
                                  type: "Input.Text",
                                  id: "first_name",
                                  placeholder: "Enter first name",
                              }
                          ]
                      },
                      {
                          type: "Column",
                          width: "stretch",
                          items: [
                            {
                                type: "Input.Text",
                                id: "last_name",
                                placeholder: "Enter last name",
                            }
                          ],
                      }
                  ]
              },
              {
                  type: "ColumnSet",
                  columns: [
                    {
                        type: "Column",
                        width: "stretch",
                        items: [
                          {
                              type: "Input.Text",
                              id: "email",
                              placeholder: "Enter email",
                          }
                        ]
                    },
                    {
                        type: "Column",
                        width: "stretch",
                        items: [
                          {
                              type: "Input.Text",
                              id: "job_title",
                              placeholder: "Enter job title",
                          }
                        ]
                    }
                  ]
              },
              {
                type: "Container",
                items: [
                  {
                    type: "ColumnSet",
                    columns: [
                      {
                        type: "Column",
                        width: "stretch",
                        items: [createTextBlock("Lead status:")]
                      },
                      {
                        type: "Column",
                        width: "auto",
                        items: [
                          {
                            type: "Input.ChoiceSet",
                            id: "lead_status",
                            style: "compact",
                            isMultiSelect: false,
                            choices: [
                              { title: "New", value: "NEW" },
                              { title: "Open", value: "OPEN" },
                              { title: "In Progress", value: "IN_PROGRESS" },
                              { title: "Open deal", value: "OPEN_DEAL" },
                              { title: "Unqualified", value: "UNQUALIFIED" },
                              { title: "Attempted to contact", value: "ATTEMPTED_TO_CONTACT" },
                              { title: "Connected", value: "CONNECTED" },
                              { title: "Bad timing", value: "BAD_TIMING" },
                              { title: "Unassigned", value: "UNASSIGNED" }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                type: "Container",
                items: [
                  {
                    type: "ColumnSet",
                    columns: [
                      {
                        type: "Column",
                        width: "stretch",
                        items: [createTextBlock("Life cycle stage:")]
                      },
                      {
                        type: "Column",
                        width: "auto",
                        items: [
                          {
                            type: "Input.ChoiceSet",
                            id: "life_cycle_stage",
                            style: "compact",
                            isMultiSelect: false,
                            choices: [
                              { title: "Subscriber", value: "subscriber" },
                              { title: "Lead", value: "lead" },
                              { title: "Marketing Qualified Lead", value: "mql" },
                              { title: "Sales Qualified Lead", value: "sql" },
                              { title: "Opportunity", value: "opportunity" },
                              { title: "Customer", value: "customer" },
                              { title: "Evangelist", value: "evangelist" }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                type: "ActionSet",
                actions: [
                  {
                    type: "Action.Submit",
                    title: "Create New Contact",
                    data: {
                      path: "create_contact",
                      bot_id: this.botId
                    }
                  }
                ]
              }
          ]
      }
      return card
    },
    createHubSpotContact: async function(data, cardId){
      this.userDataObj = await this.readUserData()
      var params = {
              properties: [
                {
                  property: "email",
                  value: data.email
                },
                {
                  property: "firstname",
                  value: data.first_name
                },
                {
                  property: "lastname",
                  value: data.last_name
                },
                {
                  property: "company",
                  value: "Unknown"
                },
                {
                  property: "phone",
                  value: data.phone_number
                },
                {
                  property: "jobtitle",
                  value: data.job_title
                },
                {
                  property: "hs_lead_status",
                  value: data.lead_status
                },
                {
                  property: "lifecyclestage",
                  value: data.life_cycle_stage
                }
              ]
            }
        //console.log(params)
        if (!this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)){
          this.userDataObj.hs_access_tokens = await this.hubspot_platform.refreshTokens()
          this.updateUserData()
        }
        //this.userDataObj.hs_access_tokens = await this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)
        if (!this.userDataObj.hs_access_tokens){
          console.log("tokens expired. Please login")
          return
        }
        var result = await this.hubspot_platform.post('/contacts/v1/contact', params)
        //console.log(result)
          // need update the card?
          if (result){
            var contact = JSON.parse(result)
            var cCard = this.createCustomerCard(contact)
            console.log(cCard)
            console.log(this.activeCalls)
            for (var call of this.activeCalls){
              console.log(`${call.customerNumber} == ${deformatPhoneNumber(data.phone_number)}`)
              if (call.customerNumber == deformatPhoneNumber(data.phone_number)){
                call.cCard = {
                  title: "Customer Info",
                  customer: true,
                  contactId: contact.vid,
                  portalId: contact['portal-id'],
                  card: cCard
                }
                //call.cCard = card
                var offset = new Date().getTimezoneOffset();
                console.log("offset " + offset)
                var utcOffset = offset * 60000
                var dateTime = new Date(call.callTimestamp - utcOffset).toISOString().substr(2, 14).replace('T', ' ')
                var title = `Caller phone number:  ${formatPhoneNumber(call.customerNumber)}`

                var params = {
                        type: "AdaptiveCard",
                        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                        version: "1.3",
                        body: [
                            {
                                type: "Container",
                                items: [
                                    {
                                        type: "ColumnSet",
                                        columns: [
                                            {
                                                type: "Column",
                                                width: "stretch",
                                                items: [createTitleTextBlock(title)]
                                            },
                                            {
                                                type: "Column",
                                                width: "auto",
                                                items: [
                                                  {
                                                      type: "Image",
                                                      height: "25px",
                                                      url: "http://www.qcalendar.com/icons/RINGING.png"
                                                  }
                                                ],
                                            }
                                        ]
                                    }
                                ]
                            },
                            {
                                type: "Container",
                                items: [
                                    {
                                        type: "ColumnSet",
                                        columns: [
                                            {
                                                type: "Column",
                                                width: "auto",
                                                items: [createTextBlock("Date/time:")]
                                            },
                                            {
                                                type: "Column",
                                                width: "auto",
                                                items: [createValueBlock(dateTime)]
                                            }
                                        ]
                                    }
                                ]
                            },
                            {
                              type: "ActionSet",
                              actions: [
                                {
                                  type: "Action.Submit",
                                  title: "Update Customer Info",
                                  data: {
                                    path: "update_contact",
                                    contact_id: contact.vid,
                                    bot_id: this.botId
                                  }
                                }
                              ]
                            }
                        ]
                  }
                      // add block
                  params.body.push({
                          type: "TextBlock",
                          size: "Large",
                          color: 'good',
                          weight: "Bolder",
                          text: call.cCard.title
                    })
                  params.body.push(call.cCard.card)
                  //console.log(params)
                  var ret = await this.bot.updateAdaptiveCard(cardId, params)
                  console.log("Done create new customer and update card")
                  break
              }
            }
            //this.updateUserData()
          }
        //})
    },
    updateHubSpotContact: async function(data, cardId){
      //this.userDataObj = await this.readUserData()
      var params = {
              properties: [
                {
                  property: "hs_lead_status",
                  value: data.lead_status
                },
                {
                  property: "lifecyclestage",
                  value: data.life_cycle_stage
                }
              ]
            }
        if (!this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)){
          this.userDataObj.hs_access_tokens = await this.hubspot_platform.refreshTokens()
          this.updateUserData()
        }

        if (!this.userDataObj.hs_access_tokens){
          console.log("tokens expired. Please login")
          this.handleLogin(true, 'login')
          return
        }
        var result = await this.hubspot_platform.post(`/contacts/v1/contact/vid/${data.contact_id}/profile`, params)
        console.log(result)
          // need update the card?
        /*
          if (result){
            for (var call of this.activeCalls){
              console.log(`${call.cCard.contactId} == ${data.contact_id}`)
              if (call.cCard.contactId == data.contact_id){
                console.log("Done update contact")
                break
              }
            }
          }
        */
    },
    addHubSpotCall_V2: async function(data, cardId){
      var params = {
          engagement: {
            active: true,
            //ownerId: 1,
            type: "CALL",
            timestamp: data.timestamp
          },
          associations: {
            contactIds: [data.contact_id]
          },
          metadata: {
            toNumber: data.to_number,
            fromNumber: data.from_number,
            status: "COMPLETED",
            durationMilliseconds: data.duration,
            //"recordingUrl" : "https://api.twilio.com/2010-04-01/Accounts/AC890b8e6fbe0d989bb9158e26046a8dde/Recordings/RE3079ac919116b2d22",
            body: data.notes
          }
        }
        // https://api.hubspot.com/engagements/v2/engagements?portalId=6879799&clienttimeout=14000&hs_static_app=crm-records-ui&hs_static_app_version=1.18376
        var params =
        {
          properties: [
            {
              name: "hs_engagement_type",
              value: "CALL"
            },
            {
              name: "hs_timestamp",
              value: data.timestamp
            },
            {
              name: "hubspot_owner_id",
              value: 125643277
            },
            {
              name: "hs_at_mentioned_owner_ids",
              value: ""
            },
            {
              name: "hs_engagement_source",
              value: "CRM_API"
            },
            {
              name: "hs_activity_type",
              value: "Follow-up"
            },
            {
              name: "hs_call_body",
              value: data.notes
            },
            {
              name: "hs_call_disposition",
              value: data.call_disposition
            },
            {
              name: "hs_call_duration",
              value: data.duration
            },
          ]
        }
        //console.log(params)
        if (!this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)){
          this.userDataObj.hs_access_tokens = await this.hubspot_platform.refreshTokens()
          this.updateUserData()
        }
        //this.userDataObj.hs_access_tokens = await this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)
        if (!this.userDataObj.hs_access_tokens){
          console.log("tokens expired. Please login")
          return
        }
        var result = this.hubspot_platform.post(`/engagements/v2/engagements`, params)
        console.log(result)
    },
    addTemporaryNotes: function(data, cardId){
      //this.userDataObj.
      console.log(data.temp_notes)
      console.log(this.activeCalls)
      var call = this.activeCalls.activeCalls.find(o => o.partyId == data.party_id)
      if (call){
        call.tempNotes = data.temp_notes
      }
    },
    addHubSpotCall_v1: async function(data, cardId){
      //this.userDataObj = await this.readUserData()
      console.log(data.notes)
      var notes = data.notes.replace(/\r?\n/g, "<br>")
      console.log(notes)
      var recordingUri = ''
      if (data.recordingId != '')
        recordingUri = await this.getRecordingUrl(data.recordingId)

      var params = {
          engagement: {
            active: true,
            type: "CALL",
            timestamp: data.timestamp
          },
          associations: {
            contactIds: [data.contact_id]
          },
          metadata: {
            toNumber: data.to_number,
            fromNumber: data.from_number,
            status: "COMPLETED",
            durationMilliseconds: data.duration,
            recordingUrl : recordingUri.contentUri,
            body: notes,
            disposition: data.call_disposition
          }
        }

        console.log(params)
        if (!this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)){
          this.userDataObj.hs_access_tokens = await this.hubspot_platform.refreshTokens()
          this.updateUserData()
        }
        //this.userDataObj.hs_access_tokens = await this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)
        if (!this.userDataObj.hs_access_tokens){
          console.log("tokens expired. Please login")
        }else{
          var result = await this.hubspot_platform.post(`/engagements/v1/engagements`, params)
          console.log(result)
          var jsonObj = JSON.parse(result)
          var detailedLink = undefined
          if (jsonObj.engagement)
            detailedLink = `https://app.hubspot.com/calls/${this.userDataObj.portalId}/review/${jsonObj.engagement.id}`
        }
    },
    readHubSpotCallDisposition: async function(){
      console.log("readHubSpotCallDisposition")
      if (!this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)){
        this.userDataObj.hs_access_tokens = await this.hubspot_platform.refreshTokens()
        this.updateUserData()
      }
      //this.userDataObj.hs_access_tokens = await this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)
      if (!this.userDataObj.hs_access_tokens){
        console.log("tokens expired. Please login")
        return
      }
      var result = await this.hubspot_platform.get(`/calling/v1/dispositions`, null)
      console.log(result)
      if (result){
          console.log("Completed")
          var jsonObj = JSON.parse(result)
          this.userDataObj.hubspotCallDisposition = []
          for (var item of jsonObj){
            var obj = {
              title: item.label,
              value: item.id
            }
            this.userDataObj.hubspotCallDisposition.push(obj)
          }
          console.log(this.userDataObj.hubspotCallDisposition)
      }
    },
    createCardMainHeader: function(title){
      var ts = new Date().getTime()
      var dateTime = new Date(ts - this.utcOffset).toISOString().substr(5, 14).replace('T', ' at ')
      return params = {
        type: "AdaptiveCard",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        version: "1.3",
        body: [
          {
            type: "Container",
            items: [
              {
                type: "ColumnSet",
                columns: [
                  {
                    type: "Column",
                    width: "stretch",
                    items: [createTitleTextBlock(title)]
                  },
                  {
                    type: "Column",
                    width: "auto",
                    items: [createValueBlock(dateTime)]
                  }
                ]
              }
            ]
          }
        ]
      }
    },
    /*
    performSearchCompanies: async function(data, cardId){
      this.searchCompanyHS(data.search_field, data.search_arg, cardId)
    },*/
    searchCompanyHS: async function(field, args, cardId){
      ///crm/v3/objects/companies/search
      // Add HubSpot contact info
      if (this.userDataObj.hs_access_tokens){
        if (!this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)){
          this.userDataObj.hs_access_tokens = await this.hubspot_platform.refreshTokens()
          await this.updateUserData()
        }
        if (this.userDataObj.hs_access_tokens){
          var query = {
                filterGroups:[
                  {
                    filters:[
                      {
                        propertyName: field,
                        operator: "EQ",
                        value: args
                      }
                    ]
                  }
                ],
                properties: [ "email", "name", "website", "phone", "description", "domain" ]
              }
          console.log(JSON.stringify(query))
          var response = await this.hubspot_platform.post('/crm/v3/objects/companies/search', query)
          //console.log(response)
          var jsonObj = JSON.parse(response)
          console.log(JSON.stringify(jsonObj))
          var params = undefined
          if (jsonObj.results.length){
            var property = jsonObj.results[0].properties
            var createdDate = new Date(property.createdate)
            var modifiedDate = new Date(property.hs_lastmodifieddate)
            createdDate = createdDate.toLocaleDateString("en-US",{month:'short', year:'numeric', day:'numeric'})
            modifiedDate = modifiedDate.toLocaleDateString("en-US",{month:'short', year:'numeric', day:'numeric'})
            params = createSearchFormCard(this.botId, "companies", field)

            var phone = (property.phone) ? formatPhoneNumber(property.phone) : "N/A"
            var website = (property.website) ? property.website : property.domain
            if (website == null)
              website = "N/A"

            var card = [
              {
                  type: "Container",
                  separator: true,
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Name")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Phone")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Website")]
                              }
                          ]
                      }
                  ]
              },
              {
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(property.name)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(phone)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(website)]
                              }
                          ]
                      }
                  ]
              },
              {
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Created date")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Last activity date")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Archived")]
                              }
                          ]
                      }
                  ]
              },
              {
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(createdDate)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(modifiedDate)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(`${jsonObj.results[0].archived}`)]
                              }
                          ]
                      }
                  ]
              },
              createTextBlock("Description"),
              {
                type: "TextBlock",
                size: "Medium",
                wrap: true,
                color: 'accent',
                text: property.description
              },
              {
                type: "ActionSet",
                actions: [
                  {
                    type: "Action.OpenUrl",
                    title: 'View company details',
                    url: `https://app.hubspot.com/contacts/${this.userDataObj.portalId}/company/${jsonObj.results[0].id}`
                  }
                ]
              }
            ]

            params.body = params.body.concat(card)
            if (cardId != '')
              this.bot.updateAdaptiveCard(cardId, params)
            else
              this.bot.sendAdaptiveCard(this.groupId, params)
          }else{
            params = createSearchFormCard(this.botId, 'companies', field)
            var card = createTextBlock("Not found!")
            params.body = params.body.concat(card)
            if (cardId != '')
              this.bot.updateAdaptiveCard(cardId, params)
            else
              this.bot.sendAdaptiveCard(this.groupId, params)
          }
        }
      }
    },/*
    performSearchContacts: async function(data, cardId){
      this.searchContactHS(data.search_field, data.search_arg, cardId)
    },*/
    searchContactHS: async function(field, args, cardId){
      ///crm/v3/objects/companies/search
      // Add HubSpot contact info
      if (this.userDataObj.hs_access_tokens){
        if (!this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)){
          this.userDataObj.hs_access_tokens = await this.hubspot_platform.refreshTokens()
          await this.updateUserData()
        }
        //this.userDataObj.hs_access_tokens = await this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)
        if (this.userDataObj.hs_access_tokens){
          var query = {
                filterGroups:[
                  {
                    filters:[
                      {
                        propertyName: field,
                        operator: "EQ",
                        value: args
                      }
                    ]
                  }
                ],
                properties: [ "email", "firstname", "lastname", "phone", "mobilephone" ]
              }
          console.log(JSON.stringify(query))
          var response = await this.hubspot_platform.post('/crm/v3/objects/contacts/search', query)
          //console.log(response)
          var jsonObj = JSON.parse(response)
          console.log(JSON.stringify(jsonObj))
          var params = undefined
          if (jsonObj.results.length){
            var property = jsonObj.results[0].properties
            var createdDate = new Date(property.createdate)
            var modifiedDate = new Date(property.lastmodifieddate)
            createdDate = createdDate.toLocaleDateString("en-US",{month:'short', year:'numeric', day:'numeric'})
            modifiedDate = modifiedDate.toLocaleDateString("en-US",{month:'short', year:'numeric', day:'numeric'})
            params = createSearchFormCard(this.botId, "contacts", field)
            var fullName = (`${property.firstname}, ${property.lastname}`)
            var number = (property.mobilephone) ? property.mobilephone : property.phone
            var card = [
              {
                  type: "Container",
                  separator: true,
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Full name")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Email")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Phone")]
                              }
                          ]
                      }
                  ]
              },
              {
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(fullName)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(property.email)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(formatPhoneNumber(number))]
                              }
                          ]
                      }
                  ]
              },
              {
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Created date")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Last activity date")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Archived")]
                              }
                          ]
                      }
                  ]
              },
              {
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(createdDate)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(modifiedDate)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(`${jsonObj.results[0].archived}`)]
                              }
                          ]
                      }
                  ]
              },
              {
                type: "ActionSet",
                actions: [
                  {
                    type: "Action.OpenUrl",
                    title: 'View contact details',
                    url: `https://app.hubspot.com/contacts/${this.userDataObj.portalId}/contact/${jsonObj.results[0].id}`
                  }
                ]
              }
            ]
            params.body = params.body.concat(card)
            if (cardId != '')
              this.bot.updateAdaptiveCard(cardId, params)
            else
              this.bot.sendAdaptiveCard(this.groupId, params)
          }else{
            //await this.bot.sendMessage(this.groupId, { text: 'Not found!' })
            params = createSearchFormCard(this.botId, 'contacts', field)
            var card = createTextBlock("Not found!")
            params.body = params.body.concat(card)
            if (cardId != '')
              this.bot.updateAdaptiveCard(cardId, params)
            else
              this.bot.sendAdaptiveCard(this.groupId, params)
          }
        }
      }
    },/*
    performSearchDeals:  async function(data, cardId){
      this.searchDealHS(data.search_field, data.search_arg, cardId)
    },*/
    searchDealHS: async function(field, args, cardId){
      // Add HubSpot contact info
      if (this.userDataObj.hs_access_tokens){
        if (!this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)){
          this.userDataObj.hs_access_tokens = await this.hubspot_platform.refreshTokens()
          await this.updateUserData()
        }
        if (this.userDataObj.hs_access_tokens){
          var query = {
                filterGroups:[
                  {
                    filters:[
                      {
                        propertyName: field,
                        operator: "EQ",
                        value: args
                      }
                    ]
                  }
                ],
                properties: [ "amount", "dealname", "dealstage", "pipeline", "description", "closedate" ]
              }
          console.log(JSON.stringify(query))
          var response = await this.hubspot_platform.post('/crm/v3/objects/deals/search', query)
          //console.log(response)
          var jsonObj = JSON.parse(response)
          console.log(JSON.stringify(jsonObj))
          var params = undefined
          if (jsonObj.results.length){
            var property = jsonObj.results[0].properties
            var createdDate = new Date(property.createdate)
            var modifiedDate = new Date(property.hs_lastmodifieddate)

            createdDate = createdDate.toLocaleDateString("en-US",{month:'short', year:'numeric', day:'numeric'})
            modifiedDate = modifiedDate.toLocaleDateString("en-US",{month:'short', year:'numeric', day:'numeric'})
            var closedDate = 'N/A'
            if (property.closedate){
              closedDate = new Date(property.closedate)
              closedDate = closedDate.toLocaleDateString("en-US",{month:'short', year:'numeric', day:'numeric'})
            }
            params = createSearchFormCard(this.botId, 'deals', field)

            var amount = (property.amount) ? property.amount : "N/A"
            var dealstage = (property.dealstage) ? property.dealstage : "N/A"
            var pipeline = (property.pipeline) ? property.pipeline : "N/A"
            var description = (property.description) ? property.description : "N/A"
            var card = [
              {
                  type: "Container",
                  separator: true,
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Deal name")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(property.dealname)]
                              }
                          ]
                      }
                  ]
              },
              createTextBlock('Description'),
              {
                type: "TextBlock",
                size: "Medium",
                wrap: true,
                color: 'accent',
                text: description
              },
              {
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Stage")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Pipeline")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Amount")]
                              }
                          ]
                      }
                  ]
              },
              {
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(dealstage)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(pipeline)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(amount)]
                              }
                          ]
                      }
                  ]
              },
              {
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Created")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Last modified")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Closed")]
                              }
                          ]
                      }
                  ]
              },
              {
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(createdDate)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(modifiedDate)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(closedDate)]
                              }
                          ]
                      }
                  ]
              },
              {
                type: "ActionSet",
                actions: [
                  {
                    type: "Action.OpenUrl",
                    title: 'View deal details',
                    url: `https://app.hubspot.com/contacts/${this.userDataObj.portalId}/deal/${jsonObj.results[0].id}`
                  }
                ]
              }
            ]

            params.body = params.body.concat(card)
            if (cardId != '')
              this.bot.updateAdaptiveCard(cardId, params)
            else
              this.bot.sendAdaptiveCard(this.groupId, params)
          }else{
            //await this.bot.sendMessage(this.groupId, { text: 'Not found!' })
            params = createSearchFormCard(this.botId, 'deals', field)
            var card = createTextBlock("Not found!")
            params.body = params.body.concat(card)
            if (cardId != '')
              this.bot.updateAdaptiveCard(cardId, params)
            else
              this.bot.sendAdaptiveCard(this.groupId, params)
          }
        }
      }
    },/*
    performSearchTickets:  async function(data, cardId){
      this.searchTicketHS(data.search_field, data.search_arg, cardId)
    },*/
    searchTicketHS: async function(field, args, cardId){
      // Add HubSpot contact info
      if (this.userDataObj.hs_access_tokens){
        if (!this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)){
          this.userDataObj.hs_access_tokens = await this.hubspot_platform.refreshTokens()
          await this.updateUserData()
        }
        if (this.userDataObj.hs_access_tokens){
          var query = {
                filterGroups:[
                  {
                    filters:[
                      {
                        propertyName: field,
                        operator: "EQ",
                        value: args
                      }
                    ]
                  }
                ],
                properties: [ "content", "description", "subject", "hs_ticket_category", "hs_pipeline", "hs_ticket_priority", "hs_pipeline_stage" ]
              }
              /*
              content,
              hs_pipeline,
              hs_pipeline_stage,
              hs_ticket_category,
              hs_ticket_priority,
              subject,
              createdate,
              hs_lastmodifieddate,
              hs_object_id
              */
          console.log(JSON.stringify(query))
          var response = await this.hubspot_platform.post('/crm/v3/objects/tickets/search', query)
          //console.log(response)
          var jsonObj = JSON.parse(response)
          console.log(JSON.stringify(jsonObj))
          /*
          {"total":1,
          "results":[{"id":"444702049",
          "properties":{
          "content":null,
          "createdate":"2021-06-11T07:00:27.853Z","hs_lastmodifieddate":"2021-06-11T07:09:40.350Z",
          "hs_object_id":"444702049",
          "hs_pipeline":"0",
          "hs_pipeline_stage":"1","hs_ticket_category":null,"hs_ticket_priority":"HIGH","subject":"Laptop issue 13"},"createdAt":"2021-06-11T07:00:27.853Z","updatedAt":"2021-06-11T07:09:40.350Z","archived":false}]}
          */
          var params = undefined
          if (jsonObj.results.length){
            var property = jsonObj.results[0].properties
            var createdDate = new Date(property.createdate)
            var modifiedDate = new Date(property.hs_lastmodifieddate)

            createdDate = createdDate.toLocaleDateString("en-US",{month:'short', year:'numeric', day:'numeric'})
            modifiedDate = modifiedDate.toLocaleDateString("en-US",{month:'short', year:'numeric', day:'numeric'})

            params = createSearchFormCard(this.botId, 'tickets', field)

            var stage = (property.hs_pipeline_stage) ? property.hs_pipeline_stage : "N/A"
            var priority = (property.hs_ticket_priority) ? property.hs_ticket_priority : "N/A"
            var pipeline = (property.hs_pipeline) ? property.hs_pipeline : "N/A"
            var content = (property.content) ? property.content : "N/A"
            var card = [
              {
                  type: "Container",
                  separator: true,
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Ticket name")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(property.subject)]
                              }
                          ]
                      }
                  ]
              },
              createTextBlock('Content'),
              {
                type: "TextBlock",
                size: "Medium",
                wrap: true,
                color: 'accent',
                text: content
              },
              {
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Pipeline")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Stage")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Priority")]
                              }
                          ]
                      }
                  ]
              },
              {
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(pipeline)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(stage)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(priority)]
                              }
                          ]
                      }
                  ]
              },
              {
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Created")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Last modified")]
                              }
                          ]
                      }
                  ]
              },
              {
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(createdDate)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(modifiedDate)]
                              }
                          ]
                      }
                  ]
              },
              {
                type: "ActionSet",
                actions: [
                  {
                    type: "Action.OpenUrl",
                    title: 'View ticket details',
                    url: `https://app.hubspot.com/contacts/${this.userDataObj.portalId}/ticket/${jsonObj.results[0].id}`
                  }
                ]
              }
            ]

            params.body = params.body.concat(card)
            if (cardId != '')
              this.bot.updateAdaptiveCard(cardId, params)
            else
              this.bot.sendAdaptiveCard(this.groupId, params)
          }else{
            //await this.bot.sendMessage(this.groupId, { text: 'Not found!' })
            params = createSearchFormCard(this.botId, 'tickets', field)
            var card = createTextBlock("Not found!")
            params.body = params.body.concat(card)

            if (cardId != '')
              this.bot.updateAdaptiveCard(cardId, params)
            else
              this.bot.sendAdaptiveCard(this.groupId, params)
          }
        }
      }
    },
    searchDealHS_old: async function(name){
      // Add HubSpot contact info
      if (this.userDataObj.hs_access_tokens){
        if (!this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)){
          this.userDataObj.hs_access_tokens = await this.hubspot_platform.refreshTokens()
          await this.updateUserData()
        }
        //this.userDataObj.hs_access_tokens = await this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)
        if (this.userDataObj.hs_access_tokens){
          var query = {
                filterGroups:[
                  {
                    filters:[
                      {
                        propertyName: "dealname",
                        operator: "EQ",
                        value: name
                      }
                    ]
                  }
                ],
              properties: [ "dealowner", "state" ]
            }
          console.log(JSON.stringify(query))
          var response = await this.hubspot_platform.post('/crm/v3/objects/deals/search', query)
          //console.log(response)
          var jsonObj = JSON.parse(response)
          console.log(JSON.stringify(jsonObj))
          if (jsonObj.results.length){
            var property = jsonObj.results[0].properties
            var createdDate = new Date(property.createdate)
            var modifiedDate = new Date(property.hs_lastmodifieddate)
            var closedDate = new Date(property.closedate)
            createdDate = createdDate.toLocaleDateString("en-US",{month:'short', year:'numeric', day:'numeric'})
            modifiedDate = modifiedDate.toLocaleDateString("en-US",{month:'short', year:'numeric', day:'numeric'})
            closedDate = closedDate.toLocaleDateString("en-US",{month:'short', year:'numeric', day:'numeric'})

            var params = this.createCardMainHeader(property.dealname)

            var card = [
              /*{
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Deal name")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(property.dealname)]
                              }
                          ]
                      }
                  ]
              },*/
              {
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Stage")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Pipeline")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Amount")]
                              }
                          ]
                      }
                  ]
              },
              {
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(property.dealstage)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(property.pipeline)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(property.amount)]
                              }
                          ]
                      }
                  ]
              },
              {
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Created")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Last modified")]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createTextBlock("Closed")]
                              }
                          ]
                      }
                  ]
              },
              {
                  type: "Container",
                  items: [
                      {
                          type: "ColumnSet",
                          columns: [
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(createdDate)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(modifiedDate)]
                              },
                              {
                                  type: "Column",
                                  width: "stretch",
                                  items: [createValueBlock(closedDate)]
                              }
                          ]
                      }
                  ]
              }
            ]

            params.body = params.body.concat(card)
            this.bot.sendAdaptiveCard(this.groupId, params)
          }else{
            await this.bot.sendMessage(this.groupId, { text: 'Not found!' })
          }
        }
      }
    },
    searchCallHS: async function(name){
      ///crm/v3/objects/companies/search
      // Add HubSpot contact info
      if (this.userDataObj.hs_access_tokens){
        if (!this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)){
          this.userDataObj.hs_access_tokens = await this.hubspot_platform.refreshTokens()
          await this.updateUserData()
        }
        //this.userDataObj.hs_access_tokens = await this.hubspot_platform.isLoggedIn(this.userDataObj.hs_access_tokens)
        if (this.userDataObj.hs_access_tokens){
          var query = {
                filterGroups:[
                  {
                    filters:[
                      {
                        propertyName: "hs_createdate",
                        operator: "EQ",
                        value: name
                      }
                    ]
                  }
                ]
              }
          console.log(JSON.stringify(query))
          var response = await this.hubspot_platform.post('/crm/v3/objects/calls/search', query)
          //console.log(response)
          var jsonObj = JSON.parse(response)
          console.log(JSON.stringify(jsonObj))
          /*
          if (jsonObj || jsonObj.contacts.length){
            //console.log("HAS CONTACTS")
            cCard = {
              title: "Contact Info",
              customer: true,
              contactId: jsonObj.contacts[0].vid,
              card: this.createCustomerCard(jsonObj.contacts[0])
            }
          }else{
            console.log("NO CONTACTS")
            var cTitle = (call.direction == "Inbound") ? "Unknown caller" : "New customer"
            cCard = {
              title: cTitle,
              customer: false,
              card: this.createNewCustomerCard(call.customerNumber)
            }
          }
          */
        }
      }
    },
    searchForm: async function(args){
      var params = createSearchFormCard(this.botId, args, "")

      var ret = await this.bot.sendAdaptiveCard(this.groupId, params)
      console.log("Card id", ret.id)
    },
    updateSearchForm: async function (data, cardId){
      var params = createSearchFormCard(this.botId, data.search_category, "")
      this.bot.updateAdaptiveCard(cardId, params)
    },
    loginHubSpot: async function(query, res){
      console.log("LOGIN HUBSPOT")
      if (query.code) {
        this.userDataObj = await this.readUserData()
        try {
          this.userDataObj.hs_access_tokens = await this.hubspot_platform.login(query.code)
          //  thisUser.updateUserData()
          if (this.userDataObj.hs_access_tokens){
            //await this.updateUserData()
            res.send("Logged in HubSpot successfully. You can close this browser tab and return to the RingCentral app.")
            await this.readHubSpotCallDisposition()
            this.bot = (await Bot.findByPk(this.botId));
            if (!this.bot)
                return console.log("Investigate and fix if this happens.")

            // read owner/owners/v2/owners/ /crm/v3/owners/
            var response = await this.hubspot_platform.get('/owners/v2/owners/') ///125643277
            //console.log(response)
            var jsonObj = JSON.parse(response)
            if (jsonObj.length)
              this.userDataObj.portalId = jsonObj[0].portalId
            this.handleLogin(true, 'login')
          }else{
            res.send("Login HubSpot failed. Close this browser tab and return to RingCentral app to try again!")
          }
        }catch(e){
          console.log(e)
        }
      }else{
        res.send("Login HubSpot failed. Close this browser tab and return to RingCentral app to try again!")
      }
    },
    loginRingCentral: async function(query, res){
      console.log("LOGIN")
      if (query.code) {
        var botId = query.state.split(":")[0]
        var tokenObj = await this.rc_platform.login(query.code)
        if (tokenObj){
          this.userDataObj = await this.readUserData()
          if (this.userDataObj) {
            console.log("UPDATE TOKENS")
            this.userDataObj.rc_access_tokens = tokenObj
          } else {
            console.log("CREATE TOKENS")
            this.userDataObj = require('./userDataObj.js')
            this.userDataObj.rc_access_tokens = tokenObj
          }
          //this.extensionId = tokenObj.owner_id
          //await this.updateUserData()
          res.send('Logged in RingCentral successfully. You can close this browser tab and return to the RingCentral app.');

          await this.subscribeForTelephonySessionNotification()

          this.bot = (await Bot.findByPk(botId));
          if (!this.bot)
              return console.log("Investigate and fix if this happens.")
          this.handleLogin(true, 'login')
        }else {
          res.send('login failed');
        }
      } else {
        res.send('No Auth code');
      }
    },
    logoutRC: async function(){
      this.userDataObj = await this.readUserData()
      this.userDataObj.rc_access_tokens = await this.rc_platform.isLoggedIn(this.userDataObj.rc_access_tokens)
      if (this.userDataObj.rc_access_tokens){
        // delete subscription
        await this.deleteSubscription(this.userDataObj.subscriptionId)
        await this.rc_platform.logout()
        this.userDataObj.subscriptionId = ''
        console.log("RC logged out")
      }else{
        console.log("No token")
      }
      this.userDataObj.rc_access_tokens = null
      //this.handleLogout()
      this.handleLogin(true, 'logout')
    },
    logoutHS: async function(){
      console.log("logoutHS")
      this.userDataObj = await this.readUserData()
      this.userDataObj.hs_access_tokens = null
      console.log(this.userDataObj)
      this.handleLogout()
    },
    getRecordingUrl_tbd: async function(call){
      var p = await this.rc_platform.getPlatform()
      if (p){
        var endpoint = `/restapi/v1.0/account/~/recording/${call.recordingId}`
        try {
          var resp = await p.get(endpoint)
          var jsonObj = await resp.json()
          if (jsonObj){
            call.recording.uri = jsonObj.contentUri
            call.recording.duration = rejsonObjsp.duration
            console.log("Call update adaptive card")
            await this.updateActiveCallCard(call)
          }
        }catch (e){
          console.log(e.message)
          console.log("Failed????", endpoint)
          return null
        }
      }else{
        console.log("No platform???")
        return null
      }
    },
    getRecordingUrl: async function(recordingId){
      var p = await this.rc_platform.getPlatform()
      if (p){
        var endpoint = `/restapi/v1.0/account/~/recording/${recordingId}`
        try {
          var resp = await p.get(endpoint)
          var jsonObj = await resp.json()
          return jsonObj
        }catch (e){
          console.log(e.message)
          console.log("Failed????", endpoint)
          return null
        }
      }else{
        console.log("No platform???")
        return null
      }
    },
    // Notifications
    subscribeForTelephonySessionNotification: async function(){
      var p = await this.rc_platform.getPlatform()
      if (p){
        var endpoint = '/restapi/v1.0/subscription'
        var eventFilters = ['/restapi/v1.0/account/~/extension/~/telephony/sessions']
        try {
          var resp = await p.post(endpoint, {
            eventFilters: eventFilters,
            deliveryMode: {
              transportType: 'WebHook',
              address: process.env.APP_WEBHOOK_DELIVERY_MODE_ADDRESS
            },
            expiresIn: process.env.APP_WEBHOOK_EXPIRES_IN
          })
          var jsonObj = await resp.json()
          console.log("Ready to telephony session event notification via WebHook.")
          this.userDataObj.subscriptionId = jsonObj.id
          console.log("Subscription created")
        } catch (e) {
          console.log('Endpoint: POST ' + endpoint)
          console.log('EventFilters: ' + JSON.stringify(eventFilters))
          console.log(e.response.headers)
          console.log('ERR ' + e.message);
        }
      }else{
         console.log("No platform")
      }
    },
    renewNotification: async function(){
      var p = await this.rc_platform.getPlatform()
      if (p){
        var endpoint = `/restapi/v1.0/subscription/${this.userDataObj.subscriptionId}`
        try {
          var resp = await p.get(endpoint)
          var jsonObj = await resp.json()
          if (jsonObj.status != "Active"){
            console.log("RENEW subscription")
            try {
            var renewResp = await p.post(`/restapi/v1.0/subscription/${this.userDataObj.subscriptionId}/renew`)
            var jsonObjRenew = renewResp.json()
              console.log("Update notification via WebHook.")
            } catch(e){
              console.log(e.message)
            }
          }else{
            console.log("still active => use it")
          }
        } catch (e) {
          console.log('Endpoint: POST ' + endpoint)
          console.log(e.response.headers)
          console.log('ERR: ' + e.message)
          await this.subscribeForTelephonySessionNotification()
        }
      }else{
        console.log("err: renewNotification");
      }
    },
    deleteSubscription: async function(subscriptionId) {
      console.log("deleteSubscription")
      var p = await this.rc_platform.getPlatform()
      if (p){
        try{
          var r =  await p.delete(`/restapi/v1.0/subscription/${subscriptionId}`)
          console.log("Deleted subscription")
        }catch(e){
          console.log("Cannot delete notification subscription")
          console.log(e.message)
        }
      }
    },
    /// Clean up WebHook subscriptions
    deleteAllRegisteredWebHookSubscriptions: async function() {
      console.log("deleteAllRegisteredWebHookSubscriptions")
      var p = await this.rc_platform.getPlatform()
      if (p){
        try{
          var resp = await p.get('/restapi/v1.0/subscription')
          var jsonObj = await resp.json()
          if (jsonObj.records.length > 0){
            for (var record of jsonObj.records) {
              console.log(JSON.stringify(record))

              if (record.deliveryMode.transportType == "WebHook"){
                if (record.id != "5ee035bb-256f-43a3-9544-4e1a24a789c8"){
                  console.log(record.id)
                  var r =  await p.delete(`/restapi/v1.0/subscription/${record.id}`)
                  console.log("Deleted")
                }
              }
            console.log("Deleted all")
            }
          }else{
            console.log("No subscription to delete")
          }
        }catch(e){
          console.log("Cannot delete notification subscription")
          console.log(e.message)
        }
      }else{
        console.log("Cannot get platform => Delete all subscriptions error")
      }
    },
    // Using Service
    updateUserData: async function(){
      const service = await findService(this.botId, this.extensionId)
      if (service === null) {
        console.log("CREATE ROW")
        Service.create({ name: 'RingCentral', botId: this.botId, userId: this.extensionId,  data: this.userDataObj })
      } else {
        console.log("UPDATE DATA")
        updateService(this.botId, this.extensionId, this.userDataObj)
      }
    },
    readUserData: async function(dataType){
      const service = await findService(this.botId, this.extensionId)
      //console.log("service", service)
      if (service){
        return service.dataValues.data
      }else{
        console.log("No saved userDataObj")
        var userDataObj = require('./userDataObj.js')
        return userDataObj
      }
    }
}
module.exports = User;

function createTextBlock(text, separator){
  if (!separator)
    separator = false
  return {
      type: "TextBlock",
      separator: separator,
      weight: "Lighter",
      size: "Medium",
      spacing: "extraLarge",
      text: text
  }
}

function createValueBlock(value){
  return {
      type: "TextBlock",
      weight: "Bolder",
      color: "accent",
      text: value
  }
}

function createTitleTextBlock(text){
  return {
      type: "TextBlock",
      weight: "Bolder",
      //size: "Medium",
      text: text
  }
}

function createSearchFormCard(botId, category, field){
  var params = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.3",
    body: []
    }

    if (category == '')  {
      params.body.push({
        type: "Container",
        items: [
          {
            type: "ColumnSet",
            columns: [
              {
                type: "Column",
                width: "120px",
                items: [createTextBlock('Search for')]
              },
              {
                type: "Column",
                width: "200px",
                items: [
                  {
                      type: 'Input.ChoiceSet',
                      id: 'search_category',
                      style: "compact",
                      isMultiSelect: false,
                      value: category,
                      choices: [
                        {
                          title: 'Company',
                          value: 'companies'
                        },{
                          title: 'Contact',
                          value: 'contacts'
                        },{
                          title: 'Deal',
                          value: 'deals'
                        },{
                          title: 'Ticket',
                          value: 'tickets'
                        },{
                          title: 'Call',
                          value: 'calls'
                        }
                      ]
                  }
                ]
              },
              {
                type: "Column",
                width: "stretch",
                items: [
                  {
                    type: "ActionSet",
                    actions: [
                      {
                        type: "Action.Submit",
                        title: "Submit",
                        data: {
                          path: "update_search_card",
                          bot_id: botId
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      })
      //return params
  }/*else{
    params.body.push(
      createTitleTextBlock(capitalizeFirstLetter(category))
    )
  }*/
  console.log(params)
  var card = undefined
  switch (category){
    case 'company':
    case 'companies':
      field = (field == '') ? 'name' : field
      card = makeCompaniesSearchCard(botId, field)
      break
    case 'contact':
    case 'contacts':
    field = (field == '') ? 'firstname' : field
      card = makeContactsSearchCard(botId, field)
      break
    case 'deal':
    case 'deals':
      field = (field == '') ? 'dealname' : field
      card = makeDealsSearchCard(botId, field)
      break
    case 'ticket':
    case 'tickets':
      field = (field == '') ? 'subject' : field
      card = makeTicketsSearchCard(botId, field)
      break
    case 'call':
    case 'calls':
      field = (field == '') ? 'fromnumber' : field
      card = makeCallsSearchCard(botId, field)
      break
    default:
      break
  }
  if (card)
    params.body.push(card)
  return params
}

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function makeCompaniesSearchCard(botId, field){
  var card = {
    type: "Container",
    separator: true,
    items: [
        {
          type: "ColumnSet",
          columns: [
            {
              type: "Column",
              width: "auto",
              items: [createTextBlock(capitalizeFirstLetter("Company"))]
            },/*
            {
              type: "Column",
              width: "120px",
              items: [createTextBlock('Search by')]
            },*/
            {
              type: "Column",
              width: "stretch",
              items: [
                {
                    type: 'Input.ChoiceSet',
                    id: 'search_field',
                    style: "compact",
                    isMultiSelect: false,
                    value: field,
                    choices: [
                      {
                        title: 'Name',
                        value: 'name'
                      },{
                        title: 'Phone number',
                        value: 'phone'
                      },{
                        title: 'Fax number',
                        value: 'fax'
                      },{
                        title: 'Email',
                        value: 'email'
                      }
                    ]
                }
              ]
            }
          ]
        },
        //createTextBlock('Search text:'),
        {
          type: "ColumnSet",
          columns: [
            {
              type: "Column",
              width: "stretch",
              items: [
                {
                    id: "search_arg",
                    type: "Input.Text",
                    placeholder: "Enter search text",
                    isMultiline: false
                }
              ]
            },
            {
              type: "Column",
              width: "auto",
              items: [
                {
                    type: "ActionSet",
                    actions: [
                      {
                        type: "Action.Submit",
                        title: "Search",
                        data: {
                          path: "search_company",
                          bot_id: botId
                        }
                      }
                    ]
                }
              ]
            }
          ]
        }
        /*
        {
            id: "search_arg",
            type: "Input.Text",
            placeholder: "Enter search text",
            isMultiline: false
        },
        {
            type: "ActionSet",
            actions: [
              {
                type: "Action.Submit",
                title: "Search",
                data: {
                  path: "search_company",
                  bot_id: botId
                }
              }
            ]
        }*/
      ]
    }
    return card
}

function makeContactsSearchCard(botId, field){
  var card = {
    type: "Container",
    separator: true,
    items: [
        {
          type: "ColumnSet",
          columns: [
            {
              type: "Column",
              width: "auto",
              items: [createTitleTextBlock(capitalizeFirstLetter("Contact"))]
            },/*
            {
              type: "Column",
              width: "120px",
              items: [createTextBlock('Search by')]
            },*/
            {
              type: "Column",
              width: "200px",
              items: [
                {
                    type: 'Input.ChoiceSet',
                    id: 'search_field',
                    style: "compact",
                    isMultiSelect: false,
                    value: field,
                    choices: [
                      {
                        title: 'First name',
                        value: 'firstname'
                      },{
                        title: 'Last name',
                        value: 'lastname'
                      },{
                        title: 'Phone number',
                        value: 'phone'
                      },{
                        title: 'Email',
                        value: 'email'
                      }
                    ]
                }
              ]
            }
          ]
        },
        //createTextBlock('Search text:'),
        {
          type: "ColumnSet",
          columns: [
            {
              type: "Column",
              width: "stretch",
              items: [
                {
                    id: "search_arg",
                    type: "Input.Text",
                    placeholder: "Enter search text",
                    isMultiline: false
                }
              ]
            },
            {
              type: "Column",
              width: "auto",
              items: [
                {
                    type: "ActionSet",
                    actions: [
                      {
                        type: "Action.Submit",
                        title: "Search",
                        data: {
                          path: "search_contact",
                          bot_id: botId
                        }
                      }
                    ]
                }
              ]
            }
          ]
        }/*
        {
            id: "search_arg",
            type: "Input.Text",
            placeholder: "Enter search text",
            isMultiline: false
        },
        {
            type: "ActionSet",
            actions: [
              {
                type: "Action.Submit",
                title: "Search",
                data: {
                  path: "search_contact",
                  bot_id: botId
                }
              }
            ]
        }*/
      ]
    }
    return card
}

function makeDealsSearchCard(botId, field){
var card = {
  type: "Container",
  separator: true,
  items: [
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "auto",
            items: [createTitleTextBlock(capitalizeFirstLetter("Deal"))]
          },/*
          {
            type: "Column",
            width: "120px",
            items: [createTextBlock('Search by')]
          },*/
          {
            type: "Column",
            width: "200px",
            items: [
              {
                  type: 'Input.ChoiceSet',
                  id: 'search_field',
                  style: "compact",
                  isMultiSelect: false,
                  value: field,
                  choices: [
                    {
                      title: 'Deal name',
                      value: 'dealname'
                    },{
                      title: 'Ticket category',
                      value: 'hs_ticket_category'
                    },{
                      title: 'Ticket Id',
                      value: 'lasths_ticket_idname'
                    },{
                      title: 'Subject',
                      value: 'subject'
                    },{
                      title: 'PipeLine stage',
                      value: 'hs_pipeline_stage'
                    },{
                      title: 'Content',
                      value: 'content'
                    }
                  ]
              }
            ]
          }
        ]
      },
      //createTitleTextBlock('Search text:'),
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "stretch",
            items: [
              {
                  id: "search_arg",
                  type: "Input.Text",
                  placeholder: "Enter search text",
                  isMultiline: false
              }
            ]
          },
          {
            type: "Column",
            width: "auto",
            items: [
              {
                  type: "ActionSet",
                  actions: [
                    {
                      type: "Action.Submit",
                      title: "Search",
                      data: {
                        path: "search_deal",
                        bot_id: botId
                      }
                    }
                  ]
              }
            ]
          }
        ]
      }/*
      {
          id: "search_arg",
          type: "Input.Text",
          placeholder: "Enter search text",
          isMultiline: false
      },
      {
          type: "ActionSet",
          actions: [
            {
              type: "Action.Submit",
              title: "Search",
              data: {
                path: "search_deal",
                bot_id: botId
              }
            }
          ]
      }*/
    ]
  }
  return card
}

function makeTicketsSearchCard(botId, field){
  var card = {
    type: "Container",
    separator: true,
    items: [
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "auto",
            items: [createTextBlock(capitalizeFirstLetter("Ticket"))]
          },
          {
            type: "Column",
            width: "200px",
            items: [
              {
                  type: 'Input.ChoiceSet',
                  id: 'search_field',
                  style: "compact",
                  isMultiSelect: false,
                  value: field,
                  choices: [
                    {
                      title: 'Subject',
                      value: 'subject'
                    },{
                      title: 'Category',
                      value: 'hs_ticket_category'
                    },{
                      title: 'Priority',
                      value: 'priority'
                    },{
                      title: 'PipeLine stage',
                      value: 'hs_pipeline_stage'
                    }
                  ]
              }
            ]
          }
        ]
      },
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "stretch",
            items: [
              {
                  id: "search_arg",
                  type: "Input.Text",
                  placeholder: "Enter search text",
                  isMultiline: false
              }
            ]
          },
          {
            type: "Column",
            width: "auto",
            items: [
              {
                  type: "ActionSet",
                  actions: [
                    {
                      type: "Action.Submit",
                      title: "Search",
                      data: {
                        path: "search_ticket",
                        bot_id: botId
                      }
                    }
                  ]
              }
            ]
          }
        ]
      }
    ]
  }
  return card
}

function formatSendingTime(processingTime){
  var hour = Math.floor(processingTime / 3600)
  hour = (hour < 10) ? "0"+hour : hour
  var mins = Math.floor((processingTime % 3600) / 60)
  mins = (mins < 10) ? "0"+mins : mins
  var secs = Math.floor(((processingTime % 3600) % 60))
  secs = (secs < 10) ? "0"+secs : secs
  return `${hour}:${mins}:${secs}`
}
function formatEstimatedTimeLeft(timeInSeconds){
  var duration = ""
  if (timeInSeconds > 3600){
    var h = Math.floor(timeInSeconds / 3600)
    timeInSeconds = timeInSeconds % 3600
    var m = Math.floor(timeInSeconds / 60)
    m = (m>9) ? m : ("0" + m)
    timeInSeconds = Math.floor(timeInSeconds % 60)
    var s = (timeInSeconds>9) ? timeInSeconds : ("0" + timeInSeconds)
    return h + ":" + m + ":" + s
  }else if (timeInSeconds > 60){
    var m = Math.floor(timeInSeconds / 60)
    timeInSeconds = Math.floor(timeInSeconds %= 60)
    var s = (timeInSeconds>9) ? timeInSeconds : ("0" + timeInSeconds)
    return m + ":" + s
  }else{
    var s = (timeInSeconds>9) ? timeInSeconds : ("0" + timeInSeconds)
    return "0:" + s
  }
}

function formatPhoneNumber(phoneNumberString) {
  var cleaned = ('' + phoneNumberString).replace(/\D/g, '')
  var match = cleaned.match(/^(1|)?(\d{3})(\d{3})(\d{4})$/)
  if (match) {
    var intlCode = (match[1] ? '+1 ' : '')
    return [intlCode, '(', match[2], ') ', match[3], '-', match[4]].join('')
  }
  return phoneNumberString
}

function deformatPhoneNumber(phoneNumberString) {
  var cleaned = phoneNumberString.replace(/[()\-\s]/g, '')
  return cleaned
}

function detectPhoneNumber(message){
  var wordArr = message.split(" ")
  var contactNumber = ""
  for (var w of wordArr){
    var number = w.replace(/[+()\-\s]/g, '')
    if (!isNaN(number)){
      if (number.length >= 10 && number.length <= 11){
        contactNumber = w.trim()
        console.log(w)
        break
      }
    }
  }
  return contactNumber
}

function sortCallTime(a, b){
  return b.call_timestamp - a.call_timestamp
}

function formatDurationTime(dur){
  dur = Math.floor(dur)
  if (dur > 86400) {
    var d = Math.floor(dur / 86400)
    dur = dur % 86400
    var h = Math.floor(dur / 3600)
    //h = (h>9) ? h : "0" + h
    dur = dur % 3600
    var m = Math.floor(dur / 60)
    m = (m>9) ? m : ("0" + m)
    dur = dur % 60
    var s = (dur>9) ? dur : ("0" + dur)
    return d + "d " + h + ":" + m + ":" + s
  }else if (dur >= 3600){
    var h = Math.floor(dur / 3600)
    dur = dur % 3600
    var m = Math.floor(dur / 60)
    m = (m>9) ? m : ("0" + m)
    dur = dur % 60
    var s = (dur>9) ? dur : ("0" + dur)
    return h + ":" + m + ":" + s
  }else if (dur >= 60){
    var m = Math.floor(dur / 60)
    dur %= 60
    var s = (dur>9) ? dur : ("0" + dur)
    return m + ":" + s
  }else{
    //var s = (dur>9) ? dur : ("0" + dur)
    return dur + " secs"
  }
}
