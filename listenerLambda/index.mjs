'use strict';

import { WebClient } from '@slack/web-api';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { CloudWatchEventsClient, PutRuleCommand, PutTargetsCommand } from "@aws-sdk/client-cloudwatch-events";

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const cweClient = new CloudWatchEventsClient({ region: 'us-east-1' });
const donutLamdaName = "makeDonutGroups";
const donutLamdaArn = "arn:aws:lambda:us-east-1:005090878732:function:makeDonutGroups";

export const handler = async (event) => {

    // listen for things
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

    // get the channel_id
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

    // if bot is removed, we need to remove the rule from the table, and also the eventbridge

    if (body.event && body.event.type === 'member_left_channel') {
        const { user, channel } = body.event;

        if (user === botUserId) {
            console.log(`Bot was removed from channel: ${channel}`);

            // Example: Remove entry from DynamoDB
            const params = {
                TableName: 'YourTableName',
                Key: {
                    team_id: { S: teamId },
                    channel_id: { S: channelId }
                }
            };

            try {

                await dynamoClient.send(new DeleteItemCommand(params));
                console.log(`Entry removed from DynamoDB for channel: ${channel}`);

                // remove from eventbridge as well


                ruleName = `schedule-${teamId}-${channelId}`

                // delete the target associated with the rule
                const removeTargetsParams = {
                    Name: ruleName,
                    Ids: [donutLamdaName]
                };
                await cweClient.send(new RemoveTargetsCommand(removeTargetsParams));

                // delete the rule itself

                const deleteRuleParams = {
                    Name: ruleName
                };
        
                await client.send(new DeleteRuleCommand(deleteRuleParams));
                console.log(`Rule deleted: ${ruleName}`);

            } catch (error) {
                console.error(`Error deleting rule or removing from database: ${ruleName}`, error);
            }

        }
    }

    const slackClient = new WebClient(botToken);

    if (body && body.type === 'event_callback' && body.event.type === 'app_mention') {
        console.log('detected app mention');
        
        let messageText = body.event.text;
        const words = messageText.split(/\s+/);

        let isInit = False;

        let weekPeriod = 2 // number of weeks per donut round
        let dayPeriod = weekPeriod * 7 // number of days per donut round
        let groupSize = 2 

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
                    
                    await slackClient.chat.postMessage({
                        token: botToken,
                        channel: body.event.channel,
                        text: "You've already started donuts in this channel!",
                        thread_ts: body.event.event_ts
                    });

                    const response = {
                        statusCode: 200,
                        body: JSON.stringify("You've already started donuts in this channel!")
                    };
                
                }
        
            } catch (error) {
                console.error('Error:', error);
            }
        }
        
        // word process to see if there are the words duration or size, with and integer after it

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
            ScheduleExpression: `rate(${dayPeriod} days)`, 
            State: 'ENABLED'
        };


        // try inserting the rule and adding a target
        try {
            const putRuleCommand = new PutRuleCommand(ruleParams);
            const ruleData = await cweClient.send(putRuleCommand);
            console.log("Successfully created rule:", ruleData.RuleArn);

            // Define the target for the rule (Lambda function)
            const targetParams = {
                Rule: ruleParams.Name, // Use the rule name created above
                Targets: [
                    {
                        Id: donutLamdaName, // Unique target ID
                        Arn: donutLamdaArn // Replace with your Lambda function ARN
                    }
                ]
            };

            // Associate the Lambda function as a target for the rule
            const putTargetsCommand = new PutTargetsCommand(targetParams);
            const targetData = await cweClient.send(putTargetsCommand);
            console.log("Successfully added Lambda function as target:", targetData);
        } catch (err) {
            console.error("Error creating rule or adding targets:", err);
        }
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

        console.log(successString);

        const response = {
            statusCode: 200,
            body: JSON.stringify(successString)
        };

        return response;

    }

    
    return {
        statusCode: 200
    };
    
    
};