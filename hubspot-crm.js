var querystring = require('querystring')
var https = require('https')
var fs = require('fs')

function HubSpot() {
  //this.extensionId = extensionId
  //this.botId = botId
  this.tokens = undefined
  //this.refreshTokenTimer = undefined
}
exports.HubSpot = HubSpot

HubSpot.prototype = {
    getLoginUrl: function(state){
      const authUrl =
          'https://app.hubspot.com/oauth/authorize' +
          `?client_id=${encodeURIComponent(process.env.HS_APP_CLIENT_ID)}` +
          `&scope=${process.env.HS_SCOPES}` + // ${encodeURIComponent(SCOPES)}
          `&redirect_uri=${encodeURIComponent(process.env.HS_REDIRECT_URI)}` +
          `&state=${state}`;
      return authUrl
    },
    isLoggedIn: function(tokensObj){
      this.tokens = tokensObj
      var now = new Date().getTime()
      var time = (now - tokensObj.timestamp) / 1000
      if (time < this.tokens.expires_in)
        return true
      else{
        return false
      }
    },
    login: function(code){
      return new Promise((resolve, reject) => {
        var endpoint = "/oauth/v1/token"
        var params = {
          grant_type: "authorization_code",
          client_id: process.env.HS_APP_CLIENT_ID,
          client_secret: process.env.HS_APP_CLIENT_SECRET,
          redirect_uri: process.env.HS_REDIRECT_URI,
          code: code
        }
        var url = process.env.HS_SERVER_URL
        var body = querystring.stringify(params)
        var headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': body.length
            }

        var options = {host: url, path: endpoint, method: 'POST', headers: headers};
        var thisClass = this
        var post_req = https.request(options, function(res) {
            var response = ""
            res.on('data', function (chunk) {
                  response += chunk
            }).on("end", function(){
                if (res.statusCode == 200){
                  thisClass.tokens = JSON.parse(response)
                  thisClass.tokens['timestamp'] = new Date().getTime()
                  resolve(thisClass.tokens)
                }else{
                  reject(null)
                }
            });
          }).on('error', function (e) {
            console.log(e)
            throw(e)
          })
          if (body != "")
              post_req.write(body);
          post_req.end();
      })
    },
    refreshTokens: async function(){
      return new Promise((resolve, reject) => {
        var endpoint = "/oauth/v1/token"
        var params = {
          grant_type: "refresh_token",
          client_id: process.env.HS_APP_CLIENT_ID,
          client_secret: process.env.HS_APP_CLIENT_SECRET,
          redirect_uri: process.env.HS_REDIRECT_URI,
          refresh_token: this.tokens.refresh_token
        }
        var url = process.env.HS_SERVER_URL

        var body = querystring.stringify(params)

        var headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': body.length
            }

        var options = {host: url, path: endpoint, method: 'POST', headers: headers};
        var thisClass = this
        var post_req = https.request(options, function(res) {
            var response = ""
            res.on('data', function (chunk) {
                  response += chunk
            }).on("end", async function(){
                if (res.statusCode == 200){
                  thisClass.tokens = JSON.parse(response)
                  thisClass.tokens['timestamp'] = new Date().getTime()
                  resolve(thisClass.tokens)
                }else{
                  console.log("refresh failed => require relogin")
                  resolve(null)
                }
            });
          }).on('error', function (e) {
            console.log(e)
            resolve(null)
            //throw(e)
          })
          if (body != "")
              post_req.write(body);
          post_req.end();
        });
    },
    get: async function(endpoint, params=null) {
      return new Promise((resolve, reject) => {
        var url = process.env.HS_SERVER_URL
        if (params != null){
          endpoint += "?" + querystring.stringify(params)
        }
        console.log(endpoint)
        var headers = {
          'Authorization': `Bearer ${this.tokens.access_token}`,
          'Content-Type': 'application/json'
        }

        var options = {host: url, path: endpoint, method: 'GET', headers: headers};

        var get_req = https.get(options, function(res) {
          var response = ""
          res.on('data', function (chunk) {
            response += chunk
          }).on("end", function(){
            if (res.statusCode == 200)
              resolve(response)
            else
              resolve(response)
            });
          }).on('error', function(e) {
            reject(e)
          });
      });
    },
    post: async function(endpoint, params=null) {
      return new Promise((resolve, reject) => {
        var url = process.env.HS_SERVER_URL
        var body = ""
        if (params != null){
            body = JSON.stringify(params)
        }

        var headers = {
                      'Authorization': `Bearer ${this.tokens.access_token}`,
                      'Content-Type': 'application/json'
                      }

        var options = {host: url, path: endpoint, method: 'POST', headers: headers};

        var post_req = https.request(options, function(res) {
          var response = ""
          res.on('data', function (chunk) {
                response += chunk
          }).on("end", function(){
            if (res.statusCode == 200)
              resolve(response)
            else if (res.statusCode == 204)
              resolve('{"status": "ok"}')
            else
              reject(response)
            });
          }).on('error', function (e) {
            console.log(e)
            reject(e)
          })
          if (body != "")
            post_req.write(body);
          post_req.end();
      })
    },
    authenticate: function(callback) {
        callback(null, process.env.HS_API_KEY)
    },
    get_apikey: function(endpoint, params=null, callback=null) {
        this.authenticate(function(err, apiKey){
            if (!err) {
              var url = process.env.HS_SERVER_URL

              if (params != null){
                  endpoint += "?" + querystring.stringify(params)
                  //endpoint += `&hapikey=${apiKey}`
              }
              /*
              else{
                endpoint += `?hapikey=${apiKey}`
              }
              */
              console.log(endpoint)
              var headers = {
                  'Authorization': `Bearer ${this.tokens.access_token}`,
                  'Content-Type': 'application/json'
                  }

              var options = {host: url, path: endpoint, method: 'GET', headers: headers};

              var get_req = https.get(options, function(res) {
                    var response = ""
                    res.on('data', function (chunk) {
                        response += chunk
                    }).on("end", function(){
                        if (res.statusCode == 200)
                            return (callback == null) ? response : callback(null, response)
                        else
                            return (callback == null) ? response : callback(response, null)
                    });
                }).on('error', function(e) {
                    return (callback == null) ? e : callback(e, null)
                });
            }else
                return (callback == null) ? err : callback(err, null)
        })
    },
    post_apikey: function(endpoint, params=null, callback=null) {
        this.authenticate(function(err, apiKey){
            if (!err) {
                var url = process.env.HS_SERVER_URL
                //endpoint += `?hapikey=${apiKey}`
                console.log(url)
                var body = ""
                if (params != null){
                    body = JSON.stringify(params)
                }

                var headers = {
                    'Authorization': `Bearer ${this.tokens.access_token}`,
                    'Content-Type': 'application/json'
                    }

                var options = {host: url, path: endpoint, method: 'POST', headers: headers};

                var post_req = https.request(options, function(res) {
                    var response = ""
                    res.on('data', function (chunk) {
                          response += chunk
                    }).on("end", function(){
                        if (res.statusCode == 200)
                            return (callback == null) ? response : callback(null, response)
                        else if (res.statusCode == 204)
                            return (callback == null) ? response : callback(null, '{"status": "ok"}')
                        else
                            return (callback == null) ? response : callback(response, null)
                    });
                  }).on('error', function (e) {
                      return (callback == null) ? e : callback(e, null)
                  })
                  if (body != "")
                      post_req.write(body);
                  post_req.end();
            }else
                return (callback == null) ? err : callback(err, null)
        })
    }
}
