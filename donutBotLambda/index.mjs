'use strict';

import { WebClient } from '@slack/web-api';

export const handler = async (event) => {

    // REQS:
    // listen for eventBridge triggers
    // db for team ids to bot tokens
    // db for teamid, channelid, desired frequency, desired group size
    // defaults: once every two weeks, 2
    // make new channel with groups biweekly
    // send reminders in the middle


    // TODO: retrieve the bot token by using the team id from the eventBridge trigger
    const slackClient = new WebClient(process.env.BOT_TOKEN);

    // get channel eventBridge trigger
    // then get all people in channel(s)
    let channels = ["C02F0M910UQ"];
    // let channels = ['C05TPU5H002']; // for testing
    
    let groupSize = 2;
    
    // get the bot's own user id
    let selfInfo = await slackClient.auth.test();

    // TODO: scan the users for non-bot users
    const botId = selfInfo.user_id;
    const oldDonutbotId = "U03EF3DUADB";
    const acronymbotId = "U04K9FA677A";
    
    console.log(botId);
    
    for (let i = 0; i < channels.length; i++) {
        // get the people
        const resp = await slackClient.conversations.members({ channel: channels[i] });
        let members = resp.members.filter(element => element !== botId && element !== oldDonutbotId && element !== acronymbotId);
        
        console.log("member IDs: ");
        console.log(members);


        if (members.length < groupSize) {
            // cannot do donuts :(
            const response = {
                statusCode: 200,
                body: JSON.stringify("Error: donuts cannot be done, too few people."),
            };
            return response;
            
        }
        
        let groups = [];
        // group people up, pick a random person, and assign to bins
        while (members.length > groupSize*2 - 1) {
            
            // make new group
            let newGroup = [];
            
            for (let j = 0; j < groupSize; j++) {
                let rand_idx = Math.floor(Math.random() * members.length);
                let rand_num = members.splice(rand_idx, 1);
                newGroup.push(rand_num[0]);
            }
            
            groups.push(newGroup);
            
        }

        groups.push(members);

        
        let group_ids = [];
        console.log("here!");
        console.log(groups.length);
        // create private dm group, note channel id
        for (let i = 0; i < groups.length; i++) {
            console.log(groups[i]);
            let channelInfo = await slackClient.conversations.open({users: groups[i].join(', ')});
            console.log("channelInfo");
            console.log(channelInfo.channel.id);
            group_ids.push(channelInfo.channel.id);
        }
        
        // send an intro message
        // let intro_message = "test test";
        let intro_message = "Hello csm! I'm the slackbot doing donuts - if you're reading this, it means I've matched y'all up! While we're testing this out, feel free to complete this donut in addition to the original one! If you have any feedback about how the bot works, feel free to drop viraj a DM! ";
        
        for (let i = 0; i < group_ids.length; i++) {
            console.log("other side");
            console.log(group_ids[i]);
            await slackClient.chat.postMessage({channel: group_ids[i], text: intro_message});
        }
        
    }
    
    const response = {
        statusCode: 200,
        body: JSON.stringify("Success, donuts created"),
    };
    return response;
};
