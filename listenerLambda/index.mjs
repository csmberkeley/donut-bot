'use strict';

import { WebClient } from '@slack/web-api';
import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { CloudWatchEventsClient, PutRuleCommand, PutTargetsCommand, RemoveTargetsCommand, DeleteRuleCommand } from "@aws-sdk/client-cloudwatch-events";
import { LambdaClient, AddPermissionCommand } from "@aws-sdk/client-lambda";

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const cweClient = new CloudWatchEventsClient({ region: 'us-east-1' });
const lambdaClient = new LambdaClient({ region: 'us-east-1' });
const donutLamdaName = "makeDonutGroups";
const donutLamdaArn = "arn:aws:lambda:us-east-1:005090878732:function:makeDonutGroups";
const channelInfoTableName = 'channel_info_donut'

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
        
    console.log("request: " + JSON.stringify(event));
    
    const body = JSON.parse(event.body);

    // respond to slack challenge
    if (body && body.type === 'url_verification') {
        return {
            statusCode: 200,
            body: body.challenge
        };
    }

    let teamId;
    let channelId;

    if (body.event.type === 'channel_left' ||  body.event.type === 'group_left') {
        teamId = body.team_id;
        channelId = body.event.channel;
    } else if (body.event && body.event.team && body.event.channel) {
        teamId = body.event.team;
        channelId = body.event.channel;
    } else {
        console.log("team_id or channel id not found in request");
    }
 
    console.log("body: " + event.body);    

    let botToken;

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

    if (body.event && body.event.type === 'channel_left' ||  body.event.type === 'group_left') {

        // Remove entry from DynamoDB
        const params = {
            TableName: channelInfoTableName,
            Key: {
                team_id: { S: teamId },
                channel_id: { S: channelId }
            }
        };

        const ruleName = `schedule-${teamId}-${channelId}`;

        try {

            await dynamoClient.send(new DeleteItemCommand(params));
            console.log(`Entry removed from DynamoDB for channel: ${channelId}`);

            // delete the target associated with the rule
            const removeTargetsParams = {
                Rule: ruleName,
                Ids: [`SlackbotTarget-${teamId}`]
            };
            await cweClient.send(new RemoveTargetsCommand(removeTargetsParams));

            console.log(`target removed for: ${teamId}`);

            // delete the rule itself

            const deleteRuleParams = {
                Name: ruleName
            };
    
            await cweClient.send(new DeleteRuleCommand(deleteRuleParams));
            console.log(`Rule deleted: ${ruleName}`);

        } catch (error) {
            console.error(`Error deleting rule or removing from database: ${ruleName}`, error);
        }
    }

    const slackClient = new WebClient(botToken);

    if (body && body.type === 'event_callback' && body.event.type === 'app_mention') {
        
        let messageText = body.event.text;
        const words = messageText.split(/\s+/);

        let isInit = false;

        let weekPeriod = 2 // number of weeks per donut round
        let dayPeriod = weekPeriod * 7 // number of days per donut round
        let groupSize = 2 

        // check if message contains the word 'init'
        //  if so, check if already in the table, if so, let the user know, quit
        //  else, continue with flow

        for (let i = 0; i < words.length; i++) {
            if (words[i].toLowerCase() === 'init') {
                isInit = true;
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

                    return response;
                
                }
        
            } catch (error) {
                console.error('Error:', error);
            }
        }
        
        // word process to see if there are the words duration or size, with and integer after it

        let modified = false;

        for (let i = 0; i < words.length; i++) {
            if (words[i].toLowerCase() === 'duration' && i + 1 < words.length) {
                // Check if the next word is an integer
                const nextWord = words[i + 1];
                const durationInt = parseInt(nextWord, 10);
                
                if (!isNaN(durationInt)) {
                    dayPeriod = durationInt;
                    modified = true;
                }
            }

            if (words[i].toLowerCase() === 'size' && i + 1 < words.length) {
                // Check if the next word is an integer
                const nextWord = words[i + 1];
                const sizeInt = parseInt(nextWord, 10);
                
                if (!isNaN(sizeInt)) {
                    groupSize = sizeInt;
                    modified = true;
                }
            }
        }

        if (!isInit && !modified) {
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'App mentioned, no action necessary'}),
            };
        }

        // now make the entry into the channelInfo table
        const item = {
            team_id: { S: teamId },
            channel_id: { S: channelId },
            period: { N: dayPeriod.toString()},
            size: { N: groupSize.toString()}
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

        // const ruleParams = {
        //     Name: `schedule-${teamId}-${channelId}`,
        //     ScheduleExpression: `rate(${dayPeriod} days)`, 
        //     State: 'ENABLED'
        // };

        // for debug purposes, trigger frequently!

        const ruleParams = {
            Name: `schedule-${teamId}-${channelId}`,
            ScheduleExpression: 'rate(3 minutes)', 
            State: 'ENABLED'
        };


        // try inserting the rule and adding a target
        try {
            const putRuleCommand = new PutRuleCommand(ruleParams);
            const ruleData = await cweClient.send(putRuleCommand);
            console.log("Successfully created rule:", ruleParams.Name);

            // define the data that needs to be passed to the lambda
            const customInput = {
                teamId: teamId,
                channelId: channelId,
                botToken: botToken,
                groupSize: groupSize
            }

            // Define the target for the rule (Lambda function)
            const targetParams = {
                Rule: ruleParams.Name, // Use the rule name created above
                Targets: [
                    {
                        Id: `SlackbotTarget-${teamId}`, // Unique target ID
                        Arn: donutLamdaArn, // Replace with your Lambda function ARN
                        Input: JSON.stringify(customInput)
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

        console.log("Rule:", ruleResponse);
        console.log("Rule ARN:", ruleResponse.RuleArn);

        const ruleArn = ruleResponse.RuleArn
        // grant the lambda the permission to be called by the eventbridge event
        const addPermsParams = {
            Action: "lambda:InvokeFunction",
            FunctionName: donutLamdaName,
            Principal: "events.amazonaws.com",
            StatementId: "AllowEventBridgeInvoke",
            SourceArn: ruleArn, // This allows any EventBridge rule to invoke the function
        };
    
        const command = new AddPermissionCommand(addPermsParams);
    
        try {
            const data = await lambdaClient.send(command);
            console.log("Permission added:", data);
        } catch (err) {
            console.error("Error adding permission:", err);
        }
        
        // send a message telling the user that donuts were successfully created/updated

        let initWord;

        if (isInit) {
            initWord = 'created';
        } else {
            initWord = 'updated';
        }

        const successString = `yay! Your donut group has been ${initWord} with new donuts every ${weekPeriod} weeks and groups size of ${groupSize}`;

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