'use strict';

import { WebClient } from '@slack/web-api';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { CloudWatchEventsClient, PutRuleCommand, PutTargetsCommand } from "@aws-sdk/client-cloudwatch-events";

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const cweClient = new CloudWatchEventsClient({ region: 'us-east-1' });

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

    const channelInfoTableName = 'channel_info_donut'
        
    console.log(JSON.stringify(event.body));
    
    console.log("request: " + JSON.stringify(event));
    
    const body = JSON.parse(event.body);
        
    console.log("body: " + event.body);

    // get the team_id
    const teamId = body.event.team;

    // get the channel_id (TODO)
    const channelId = body.event.channel

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

    if (body && body.type === 'event_callback' && body.event.type === 'app_mention') {
        console.log('detected app mention');
        
        let messageText = body.event.text;
        let isInit = False;
        

        let weekPeriod = 2 // number of weeks per donut round
        let dayPeriod = weekPeriod * 7 // number of days per donut round
        let groupSize = 2 

        // TODO
        // check if message contains the word 'init'
        //  if so, check if already in the table, if so, let the user know, quit
        //  else, continue with flow

        for (let i = 0; i < words.length; i++) {
            if (words[i].toLowerCase() === 'init') {
                isInit = True;
            }
        }

        if (isInit) {
            // check if it exists already

            const getParams = {
                TableName: channelInfoTableName,
                Key: {
                    'team_id': { S: teamId },
                    'channel_id': { S: channelId }
                }
            };
        
            try {
                const data = await dynamoClient.send(new GetItemCommand(getParams));
                if (data.Item) {
                    console.log('Item already exists:', data.Item);
                    
                    // TODO: write message saying that donutbot already exists
                
                }
        
            } catch (error) {
                console.error('Error:', error);
            }
        }
        
        // word process to see if there are the words duration or size, with and integer after it

        const words = inputString.split(/\s+/);

        for (let i = 0; i < words.length; i++) {
            if (words[i].toLowerCase() === 'duration' && i + 1 < words.length) {
                // Check if the next word is an integer
                const nextWord = words[i + 1];
                const durationInt = parseInt(nextWord, 10);
                
                if (!isNaN(durationInt)) {
                    dayPeriod = durationInt;
                }
            }

            if (words[i].toLowerCase() === 'size' && i + 1 < words.length) {
                // Check if the next word is an integer
                const nextWord = words[i + 1];
                const sizeInt = parseInt(nextWord, 10);
                
                if (!isNaN(sizeInt)) {
                    groupSize = sizeInt;
                }
            }
        }

        // now make the entry into the channelInfo table
        const item = {
            team_id: { S: teamId },
            channel_id: { S: channelId },
            period: { N: dayPeriod},
            size: { N: groupSize}
        };

        console.log("created items")

        const params = {
            TableName: channelInfoTableName,
            Item: item,
        };

        try {
            const command = new PutItemCommand(params);
            const result = await dynamoClient.send(command);
            console.log('Item inserted:', result);
            
        } catch (error) {
            console.error('Error inserting item:', error);

            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Error inserting item.', error }),
            };
        }

        // make/update eventBridge rule

        const ruleParams = {
            Name: `schedule-${teamId}-${channelId}`,
            ScheduleExpression: `cron(0 0 1 */2 *)`, // TODO
            State: 'ENABLED'
        };
        const ruleResponse = await cweClient.send(new PutRuleCommand(ruleParams));

        // Add the Lambda function as a target for the rule
        const targetParams = {
            Rule: ruleParams.Name,
            Targets: [
                {
                    Id: `SlackbotTarget-${teamId}`,
                    Arn: 'arn:aws:lambda:us-west-2:123456789012:function:YourSlackbotLambda',
                    Input: JSON.stringify({
                        team_id: teamId,
                        metadata: metadata
                    })
                }
            ]
        };
        await cweClient.send(new PutTargetsCommand(targetParams));



        
        // send a message telling the user that donuts were successfully created/updated

        let initWord;

        if (isInit) {
            initWord = 'created';
        } else {
            initWord = 'updated';
        }

        successString = `yay! Your donut group has been ${initWord} with new donuts every ${weekPeriod} weeks and groups size of ${groupSize}`;


    }

    
    return {
        statusCode: 200
    };
    
    
};