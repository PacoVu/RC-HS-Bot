const axios = require('axios')
const createApp = require('ringcentral-chatbot/dist/apps').default
const { Service, Bot } = require('ringcentral-chatbot/dist/models')
var Engine = require('./engine.js')

const findService = async (user) => {
  const service = await Service.findOne({ where: { name: 'RingCentral', userId: user.id } })
  return service
}

var users = []
var activeCalls = []

const handle = async event => {
  const { type, text, group, bot, userId } = event
  console.log("TYPE " + type)
  //console.log(event)
  if (type == 'BotJoinGroup'){
    console.log(group)
    var extensionId = userId //group.id
    console.log("extensionId", extensionId)
  }else if (type === 'PostAdded') {
    console.log("PostAdded event")
    //console.log(event)
  }else if (type === 'Message4Bot') {
    var userActiveCalls = activeCalls.find(o => o.extensionId == userId)
    if (!userActiveCalls){
      userActiveCalls = {
        extensionId: userId,
        activeCalls: []
      }
      activeCalls.push(userActiveCalls)
    }
    var command = getCommand(text.toLowerCase())
    console.log(command)
    switch (command.command){
      case 'help':
        console.log("HELP")
        console.log("extensionId - ", userId)

        //var records = await bot.getSubscriptions()
        //console.log(records)
        // can delete extra/old subscription
        //var resp = await bot.deleteSubscription("4b1e065d-94b2-47bb-9a9e-cfac79dc9fe6")
        await bot.sendMessage(group.id, { text: 'Here is a list of commands\r\nhelp: How to use this app\r\n login: Login \r\n logout: Logout\r\ncall_reports: Get all call reports\r\nlast_call_report: Get last call report' })
        break
      case 'login':
        console.log(group)
        var user = new Engine(bot, group.id, userId, bot.id, userActiveCalls);
        user.handleLogin(false, 'login')
        break
      case 'logout':
        var user = new Engine(bot, group.id, userId, bot.id, userActiveCalls);
        user.handleLogin(false, 'logout')
        break
      case 'company':
        var user = new Engine(bot, group.id, userId, bot.id, userActiveCalls);
        var ret = await user.handleLogin(false)
        if (ret == 'Continue')
          user.searchCompanyHS('name', command.args, '')
        break
      case 'contact':
        var user = new Engine(bot, group.id, userId, bot.id, userActiveCalls);
        var ret = await user.handleLogin(false)
        if (ret == 'Continue')
          user.searchContactHS('firstname', command.args, '')
        break
      case 'deal':
        var user = new Engine(bot, group.id, userId, bot.id, userActiveCalls);
        var ret = await user.handleLogin(false)
        if (ret == 'Continue')
          user.searchDealHS('dealname', command.args, '')
        break
      case 'ticket':
        var user = new Engine(bot, group.id, userId, bot.id, userActiveCalls);
        var ret = await user.handleLogin(false)
        if (ret == 'Continue')
          user.searchTicketHS('subject', command.args, '')
        break
      case 'call':
        var user = new Engine(bot, group.id, userId, bot.id, userActiveCalls);
        var ret = await user.handleLogin(false)
        if (ret == 'Continue')
          user.searchCallHS(command.args)
        break
      case 'search':
        var user = new Engine(bot, group.id, userId, bot.id, userActiveCalls);
        var ret = await user.handleLogin(false)
        if (ret == 'Continue')
          user.searchForm(command.args)
        break
      default:
        await bot.sendMessage(group.id, { text: 'How can I help you? Text "help" to get a list of valid command' })
        break
      }
  }else if (type == 'UserSubmit'){
    //console.log(event)
    const message = event.message
    var userActiveCalls = activeCalls.find(o => o.extensionId == userId)
    if (!userActiveCalls){
      userActiveCalls = {
        extensionId: userId,
        activeCalls: []
      }
      activeCalls.push(userActiveCalls)
    }
    var user = new Engine(bot, group.id, userId, bot.id, userActiveCalls);
    const path = message.data.path
    if (path == 'logout_rc'){
      user.logoutRC()
    }else if (path == 'logout_hs'){
      user.logoutHS()
    }else{
      const ret = await user.handleLogin(false)
      if (ret == 'Continue'){
        var data = message.data
        if (path == 'read_report'){
          user.readReport(data, message.card.id)
        }else if (path == 'create_contact'){
          user.createHubSpotContact(data, message.card.id)
        }else if (path == 'update_contact'){
          user.updateHubSpotContact(data, message.card.id)
        }else if (path == 'add_call'){
          user.addHubSpotCall_v1(data, message.card.id)
        }else if (path == 'save_notes'){
          user.addTemporaryNotes(data, message.card.id)
        }else if (path == 'logout_rc'){
          user.logoutRC()
        }else if (path == 'logout_hs'){
          user.logoutHS()
        }else if (path == 'update_search_card'){
          user.updateSearchForm(data, message.card.id)
        }else if (path == 'search_company'){
          //user.performSearchCompanies(data, message.card.id)
          user.searchCompanyHS(data.search_field, data.search_arg, message.card.id)
        }else if (path == 'search_contact'){
          //user.performSearchContacts(message.data, message.card.id)
          user.searchContactHS(data.search_field, data.search_arg, message.card.id)
        }else if (path == 'search_deal'){
          //user.performSearchDeals(message.data, message.card.id)
          user.searchDealHS(data.search_field, data.search_arg, message.card.id)
        }else if (path == 'search_ticket'){
          //user.performSearchTickets(message.data, message.card.id)
          user.searchTicketHS(data.search_field, data.search_arg, message.card.id)
        }
      }
    }
  }
}
const app = createApp(handle)
app.listen(process.env.RINGCENTRAL_CHATBOT_EXPRESS_PORT)


/*** Implement for RC app engine ***/
// authorize user login
app.get('/oauth2callback', async (req, res) => {
  var stateArr = req.query.state.split(":")
  var user = new Engine(null, null, stateArr[1], stateArr[0]);
  if (user){
    user.loginRingCentral(req.query, res)
  }else{
    console.log("Not found")
  }
});

app.get('/hubspot-oauth', async (req, res) => {
  var stateArr = req.query.state.split(":")
  var user = new Engine(null, null, stateArr[1], stateArr[0]);
  if (user){
    user.loginHubSpot(req.query, res)
  }else{
    console.log("Not found")
  }
});

// RC app engine webhook
app.post('/app-webhookcallback', async (req, res) => {
  if(req.headers.hasOwnProperty("validation-token")) {
      res.setHeader('Validation-Token', req.headers['validation-token']);
      res.statusCode = 200;
      res.end();
  }else{
      console.log("TELEPHONY EVENT")
      console.log(req.body.body.sequence)
      console.log(req.body.body.eventTime)
      const service = await findService({ id: req.body.ownerId })
    if (!service) {
      res.statusCode = 200;
      res.end();
      return console.log("Cannot read bot id")
    }
    const bot = (await Bot.findByPk(service.dataValues.botId));
    //var ts = new Date().getTime()
    var userActiveCalls = activeCalls.find(o => o.extensionId == req.body.ownerId)
    if (!userActiveCalls){
      userActiveCalls = {
        extensionId: req.body.ownerId,
        activeCalls: []
      }
      activeCalls.push(userActiveCalls)
    }
    var user = new Engine(bot, null, req.body.ownerId, bot.id, userActiveCalls.activeCalls);
    if (user){
      if (req.body.event.indexOf("/telephony/sessions") >= 0){
        user.processNotification(req.body.body, service.dataValues.data)
      }else{
          console.log("Not my notification!!!")
          console.log(req.body)
      }
    }else
      console.log("None registered user!")
    res.statusCode = 200;
    res.end();
  }
});
/*******************************************/

setInterval(async () => axios.put(`${process.env.RINGCENTRAL_CHATBOT_SERVER}/admin/maintain`, undefined, {
  auth: {
    username: process.env.RINGCENTRAL_CHATBOT_ADMIN_USERNAME,
    password: process.env.RINGCENTRAL_CHATBOT_ADMIN_PASSWORD
  }
})
, 24 * 60 * 60 * 1000)

const intents =
  {
    help: ['help', 'how to use this app', 'what can i do with this app', 'can you help me','hello bot','what can you do for me'],
    login: ['login', 'authenticate', 'authorization', 'authentication', 'account link'],
    logout: ['logout', 'quit', 'exit', 'leave', 'sign out', 'sign off', 'signout', 'signoff'],
    search: ['search', 'find'],
    company: ['whatis', 'what is', 'what is this company', 'company', 'company name'],
    contact: ['whois', 'who is', 'who is this person', 'contact', 'lastname', 'last name', 'firstname', 'first name'],
    deal: ['get deal', 'get deals', 'deal', 'deals'],
    ticket: ['get ticket', 'get tickets', 'ticket', 'tickets'],
    call: ['get call', 'get calls', 'call', 'calls']
  }


function getCommand(text){
  for (var key of Object.keys(intents)){
    for (var val of intents[key]){
      //console.log(key, ' => ', val)
      var index = text.toLowerCase().indexOf(val)
      if (index >= 0){
        var item = {
          command: key,
          args: text.substring(val.length, text.length).trim()
        }
        return item
      }
    }
  }
  return { command: ""}
}
