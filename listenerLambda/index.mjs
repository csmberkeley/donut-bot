'use strict';

import { WebClient } from '@slack/web-api';
const {createHmac} = await import('node:crypto');
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

export const handler = async (event) => {

    // listen for two things
    // 1. donut init message
    // 2. message in established channel

    //  1. This means that the user wishes to make a new donut circle
    //  therefore, we should enter into the channelInfo table that a new channel with default frequency and 
    //  groups size has been made.

    //  We also have to create an EventBridge rule that triggers the donut group creation lambda at the right 
    //  moment

    //  2. This means that someone wants to change the frequency or group size
    //  In this case, we should update the channelInfo table appropriately
        
    console.log(JSON.stringify(event.body));
    
    console.log("request: " + JSON.stringify(event));
    
    const body = JSON.parse(event.body);
        
    console.log("body: " + event.body);

    // get the team_id

    const teamId = body.event.team;

    let botToken;

    console.log("team_id: " + teamId);

    try {
        // Query DynamoDB to get the bot token for the given team ID
        const getTokenParams = {
            TableName: 'team_tokens_donut',
            Key: {
                'team_id': { S: teamId }
            }
        };
        
        const data = await dynamoClient.send(new GetItemCommand(getTokenParams));

        console.log("retrieved db data: " + data)
        
        if (!data.Item || !data.Item.token) {
            throw new Error(`No bot token found for team ID: ${teamId}`);
        }

        botToken = data.Item.token.S;
        console.log(botToken)

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to process the event' }),
        };
    }

    // retrieve the token in this fashion

    const slackClient = new WebClient(botToken);

    // check for messages that mention the bot and ask for the current score
    if (body && body.type === 'event_callback' && body.event.type === 'app_mention') {
        console.log('detected app mention');
        
        let messageText = body.event.text;
        
        // put it toLower, remove punctuation
        messageText = messageText.toLowerCase();

        let weekPeriod = 2 // number of weeks per donut round
        let dayPeriod = weekPeriod * 7 // number of days per donut round
        let groupSize = 2 

        // check if message contains the word 'init'
        //  if so, check if already in the table, if so, let the user know, quit
        //  else, continue with flow
        
        // word process to see if there are the words duration or size

        // the integer that follows directly after 

        // fewer numbers will just mean that we use default values

        
        let wordArray = messageText.split(" ");
        
        if (wordArray.length > 2 && !isNaN(parseInt(wordArray[2], 10))) {
            if (parseInt(wordArray[2], 10) > 0 && messageText.includes("score")) {
                // we have a number in the right position, which is positive, and we've been asked for the score
                
                // make the request to dynamo db
                let numPeople = parseInt(wordArray[2], 10);
                
                // reqeust here
                
                // respond with the leaderboard
                console.log("SCORE REQUESTED");
                
            }
            
        }

        // send a message telling the user that donuts were successfully created/updated
        
    }
    
    
    if (body && body.type === 'event_callback' && body.event.type === 'message') {
        
        console.log('detected message sent');
        
        if (body.event.bot_id) {
            
            console.log("detected a bot message");
            
            await slackClient.reactions.add({
                token: botToken,
                channel: body.event.channel,
                name: "robot_face",
                timestamp: body.event.event_ts
            });
            
            // we want to take no further action, so that our bot does not reply to itself and cause an
            // infinite loop
            
            return {
                statusCode: 200
            };
            
        }
        
        // keep a tally of acronyms for the database
        
        let tally = 0;
        
        // grab the text
        let messageText = body.event.text;
        
        // put it toLower, remove punctuation
        messageText = messageText.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
        
        // split by spaces
        let wordArray = messageText.split(" ");
        console.log("word array: " + wordArray.toString());
        
        
        
        // iterate through list, looking for the csm pattern
        
        let reacted = false;
        
        for (let i = 0; i < wordArray.length - 2; i++) {
            if (wordArray[i][0] === 'c' && wordArray[i+1][0] === 's' && wordArray[i+2][0] === 'm')  {
                
                if (!reacted) {
                    
                    await slackClient.reactions.add({
                        token: botToken,
                        channel: body.event.channel,
                        name: "eyes",
                        timestamp: body.event.event_ts
                    });
                    
                    tally += 1;
                    
                    reacted = true;
                    
                }
                
                let quote = ">" + wordArray[i][0].toUpperCase() + wordArray[i].slice(1, wordArray[i].length) + " " + 
                                  wordArray[i+1][0].toUpperCase() + wordArray[i+1].slice(1, wordArray[i+1].length) + " " + 
                                  wordArray[i+2][0].toUpperCase() + wordArray[i+2].slice(1, wordArray[i+2].length) + " " +
                                  "\nnice";
                
                await slackClient.chat.postMessage({
                    token: botToken,
                    channel: body.event.channel,
                    text: "nice",
                    blocks: [{"type": "section", "text": {"type": "mrkdwn", "text": quote}}],
                    thread_ts: body.event.event_ts
                });
                
            }
            
        }
        
        // now update table 
        
        // check if channel, user is present
        
        // const columnName = 'yourColumnName';
        // const columnValue = 'desiredValue';
    
        // const params = {
        //   TableName: 'YourDynamoDBTableName',
        //   FilterExpression: `${columnName} =] :value`,
        //   ExpressionAttributeValues: {
        //     ':value': columnValue,
        //   },
        // };
    
        // const result = await dynamodb.scan(params).promise();
    
        // console.log('Query Result:', result.Items);
        
        
        // if not, add entry with 0
        
        // then, add tally to that entry
        
        let thanked = false;
        
        if (messageText.includes("good bot") && !thanked) {
            
            await slackClient.reactions.add({
                token: botToken,
                channel: body.event.channel,
                name: "heart",
                timestamp: body.event.event_ts
            });
            
            await slackClient.chat.postMessage({
                token: botToken,
                channel: body.event.channel,
                text: "nOT a pRoBleM",
                thread_ts: body.event.event_ts
            });
            
            thanked = true;
            
        }
        
        let scolded = false;
        
        if (messageText.includes("bad bot") && !scolded) {
            
            await slackClient.reactions.add({
                token: botToken,
                channel: body.event.channel,
                name: "cry",
                timestamp: body.event.event_ts
            });
            
            await slackClient.chat.postMessage({
                token: botToken,
                channel: body.event.channel,
                text: "uncommon slackbot L",
                thread_ts: body.event.event_ts
            });
            
            scolded = true;
            
        }
        
        
        let dealMentioned = false;
        
        if (messageText.includes("deal") && !dealMentioned) {
            
            await slackClient.reactions.add({
                token: botToken,
                channel: body.event.channel,
                name: "moneybag",
                timestamp: body.event.event_ts
            });
            
            await slackClient.chat.postMessage({
                token: botToken,
                channel: body.event.channel,
                blocks: [{"type": "section", "text": {"type": "mrkdwn", "text": ">deal\n looks like someone wants to play Monopoly Deal"}}],
                thread_ts: body.event.event_ts
            });
            
            dealMentioned = true;
            
        }
        
        let setMentioned = false;
        
        if (messageText.includes("set") && !setMentioned) {
            
            await slackClient.reactions.add({
                token: botToken,
                channel: body.event.channel,
                name: "diamonds",
                timestamp: body.event.event_ts
            });
            
            await slackClient.chat.postMessage({
                token: botToken,
                channel: body.event.channel,
                blocks: [{"type": "section", "text": {"type": "mrkdwn", "text": ">set\n looks like someone wants to play SET"}}],
                thread_ts: body.event.event_ts
            });
            
            dealMentioned = true;
            
        }
        
        let coldMentioned = false;
        
        if (messageText.includes("cold") && !coldMentioned) {
            
            await slackClient.reactions.add({
                token: botToken,
                channel: body.event.channel,
                name: "snowflake",
                timestamp: body.event.event_ts
            });
            
            await slackClient.chat.postMessage({
                token: botToken,
                channel: body.event.channel,
                text: "IT'S COOOOOLLLLLDDDDD!!!",
                thread_ts: body.event.event_ts
            });
            
            coldMentioned = true;
            
        }
        
        let byeMentioned = false;
        
        if (messageText.includes("bye") && !coldMentioned) {
            
            await slackClient.reactions.add({
                token: botToken,
                channel: body.event.channel,
                name: "wave",
                timestamp: body.event.event_ts
            });
            
            await slackClient.chat.postMessage({
                token: botToken,
                channel: body.event.channel,
                blocks: [{"type": "section", "text": {"type": "mrkdwn", "text": ">bye\n toodleloo!"}}],
                thread_ts: body.event.event_ts
            });
            
            byeMentioned = true;
            
        }
        
        if (messageText.includes('so true') && !wordArray.includes("bestie")) {
            await slackClient.chat.postMessage({
                token: botToken,
                channel: body.event.channel,
                text: "sooooooo true bestie",
                thread_ts: body.event.event_ts
            });
        }
        
        
        return {
            statusCode: 200
        };
        
        
    }
    
    console.log('different kind of message sent, probably a mention. No defined action for this yet');
    
    return {
        statusCode: 200
    };
    
    
};