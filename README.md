# creative-spontaneous-meetups
## Like donut-bot, this bot creates groups for meetups, but is not limited to just 25 members!
### Usage


To start a repeating set of donuts for a group of people:
1. Add the bot to your workspace if not already there by clicking [here](https://slack.com/oauth/v2/authorize?client_id=843452174659.5753322057207&scope=channels:history,channels:manage,channels:read,chat:write,chat:write.public,groups:read,mpim:history,mpim:write,mpim:write.invites,mpim:write.topic,users:read,im:write,app_mentions:read&user_scope=)! 
2. Make sure that everyone is in a channel
3. Invite creative-spontaneous-meetups to the channel (you can write `/invite` and the option should come up)
4. Mention the bot in a post, along with the word 'init', for example `@creative-spontaneous-meetups init` 

The default settings are for donuts to happen every two weeks, with group size of two. However, if you want to change that, just mention the bot along with the words `duration x size y`, with x and y being replaced with integers. `x` is the number of weeks for a donut, and `y` is the number of people per group, although there may be a few groups with one more that number.

Don't worry about restarting donuts if new people join - the donut bot should automatically include them for the next set of donuts

To stop donuts, just remove the bot from the channel (you can tyoe `/remove` and the option should come up)

---

### Technical Notes

This bot works in a similar way to the acronym bot. However, because the events the lambda is listening for and the lambda making channels and writing to them happen at different times, there are separate lambdas for these two functions. In total, there are three lambdas and two dynamoDB tables. Adding the bot to new channels and starting donuts will cause the creation of AWS EventBridge Rules as well.

The code you see here is a copy of the version that is actually running in the lambda instances: if you'd like to make changes _please_ make the changes in both places.  

The `createDonutGroups` lambda creates dm groups with `size` number of people. It sends an inital message. Currently it does not send a reminder halfay through, and it does not collect stats on donut completion. This is a potential extension area!

The `donutListenerLambda` is subscribed to events in the channels that the bot has joined. When the bot is mentioned, the labmda is triggered. It processes the input and checks for the keywords. It sets up an EventBridge rule, and then grants the lambda permission to be triggered by that rule.

Like with acronym-bot, The other lambda, `authHandlerDonut` handles the authorization of the bots. Upon clicking the link, Slack sends some information to the lambda, which we relay back for two step authentification. Slack then sends a GET request to the lambda with all of the bot info, including the new token. At this point, the bot has been added to the workspace, but we should store the team id and bot token in the database so that the other lambda can get it from the table and send using the appropriate bot token.

The dynamoDB table `team_tokens_donut` is a mapping between the worspace (team) ID and the bot token installed in that workspace. We need to do this because the bot token must be specified to send back the message to the appropriate workspace, but any given message that the bot is listening in on might be from any team: we can see the workspace (team) ID, we use the table to see what the appropriate bot to use is, and we send back the response using that bot token.

The dynamoDB table `channel_info_donut` is a mapping between the (workspace and channel) and the group size and the periodicity of donuts. This, strictly speaking is not necessary, but it is a nice way to track everything in one place.

All resources should be automatically cleaned up if the bot is removed from a channel.