'use strict';

import { WebClient } from '@slack/web-api';
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

export const handler = async (event) => {


    console.log("entered function");

    // const event_json = JSON.parse(event);
    console.log("event");
    console.log(event);
    
    // const body = JSON.parse(event.body);
    
    const code = event.queryStringParameters.code;
    
    // console.log("body");
    // console.log(body);
    console.log("code");
    console.log(code);
    
    // send code to slack

    const slackClient = new WebClient(null);
    
    const resp = await slackClient.oauth.v2.access({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                code: code,
                redirect_uri: process.env.REDIRECT_URI
            });
    
    console.log("sent message, received response")

    console.log(resp)
    
    // grab the token from the request and store in the appropriate place
    
    const token = resp.access_token;
    const team_id = resp.team.id;

    console.log("token, team_id")
    console.log(token)
    console.log(team_id)
    
    // store in dynamo db

    const tableName = 'team_tokens';
    const item = {
        team_id: { S: team_id },
        token: { S: token }
    };

    console.log("created items")

    const params = {
        TableName: tableName,
        Item: item,
    };

    try {
        const command = new PutItemCommand(params);
        const result = await dynamoClient.send(command);
        console.log('Item inserted:', result);
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Item inserted successfully.', result }),
        };
    } catch (error) {
        console.error('Error inserting item:', error);

        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error inserting item.', error }),
        };
    }
    
};

