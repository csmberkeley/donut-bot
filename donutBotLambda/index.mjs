'use strict';

import { WebClient } from '@slack/web-api';
import lodash from 'lodash';

function createGroups(ids, groupSize) {

    // shuffle array
    const shuffledArray = ids.shuffle(array);

    // if fewer than groupsize members, just return single group.
    if (groupSize >= shuffledArray.length) {
        return [ids];
    }

    // figure out group arrangement
    numGroups = shuffledArray.length / groupSize;
    remainder = shuffledArray.length % groupSize;

    // for first remainder groups, add one extra, then for last, add normal amount

    currIdNum = 0;
    let groups = [];

    for (let i = 0; i < remainder; i++) {
        newGroup = []
        for (let j = 0; i < groupSize + 1; i++) {
            newGroup.push(ids[currIdNum]);
            currIdNum++;
        }

        groups.push(newGroup)
    }

    for (let i = remainder; i < numGroups; i++) {
        newGroup = [];
        for (let j = 0; i < groupSize + 1; i++) {
            newGroup.push(ids[currIdNum]);
            currIdNum++;
        }

        groups.push(newGroup)
    }

    return groups;

}

export const handler = async (event) => {

    // REQS:
    // listen for eventBridge triggers
    // db for team ids to bot tokens
    // db for teamid, channelid, desired frequency, desired group size
    // defaults: once every two weeks, 2
    // make new channel with groups biweekly
    // send reminders in the middle


    // answer slack challenge
    if (body.type === 'url_verification') {
        return {
            statusCode: 200,
            body: body.challenge
        };
    }

    // TODO: retrieve the bot token by using the team id from the eventBridge trigger
    const slackClient = new WebClient(process.env.BOT_TOKEN);

    // get channel eventBridge trigger
    // then get all people in channel(s)
    // let channels = ["C02F0M910UQ"];
    let channelId = 'C05TPU5H002'; // for testing
    
    // TODO: make this refer to the table
    let groupSize = 2;
    
    // get the bot's own user id
    // let selfInfo = await slackClient.auth.test();

    // TODO: scan the users for non-bot users
    // const botId = selfInfo.user_id;
    // const oldDonutbotId = "U03EF3DUADB";
    // const acronymbotId = "U04K9FA677A";
    
    // console.log(botId);
    
    // get the people
    const resp = await slackClient.conversations.members({ channel: channelId });
    
    const members = resp.members;
    const humanMembers = [];
    
    console.log("member IDs: ");
    console.log(members);

    for (const memberId of members) {
        const userResponse = await slackClient.users.info({ user: memberId });

        // Step 3: Check if the user is a bot
        if (!userResponse.user.is_bot) {
            humanMembers.push(memberId);
        }
    }

    const numHumanMembers = humanMembers.length;
    
    let groups = createGroups(humanMembers, groupSize);
    
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
    
    const response = {
        statusCode: 200,
        body: JSON.stringify("Success, donuts created"),
    };
    return response;
};
