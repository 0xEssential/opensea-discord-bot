import 'dotenv/config';
import Discord, { TextChannel } from 'discord.js';
import fetch from 'node-fetch';
import { ethers } from "ethers";
import { config } from './config'
import dayjs from 'dayjs'
import localizedFormat from 'dayjs/plugin/localizedFormat'

dayjs.extend(localizedFormat)
const clog = console

const discordBot = new Discord.Client();

const minutes = 5
// run interval in seconds
const runIntervalSeconds = minutes * 60

function sleepSeconds(seconds: number) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

const discordSetup = async (channel: string): Promise<TextChannel> => {
    const channelID = channel
    return new Promise<TextChannel>((resolve, reject) => {
        if (!process.env['DISCORD_BOT_TOKEN']) reject('DISCORD_BOT_TOKEN not set')
        discordBot.login(process.env.DISCORD_BOT_TOKEN);
        discordBot.on('ready', async () => {
            const channel = await discordBot.channels.fetch(channelID!);
            resolve(channel as TextChannel);
        });
    })
}

const formatPrice = (price: number) => {
    return `${ethers.utils.formatEther(price || '0')}${ethers.constants.EtherSymbol}`
}

const buildMessage = (sale: any) => (
    new Discord.MessageEmbed()
        .setColor('#0099ff')
        .setTitle(sale.asset.name + ' sold!')
        .setURL(sale.asset.permalink)
        .setAuthor(config.author.name, config.author.icon, config.author.link)
        .setThumbnail(sale.asset.collection.image_url)
        .addFields(
            { name: 'Name', value: sale.asset.name },
            { name: 'Amount', value: formatPrice(sale.total_price) },
            { name: 'Buyer', value: sale?.winner_account?.address, },
            { name: 'Seller', value: sale?.seller?.address, },
        )
        .setImage(sale.asset.image_url)
        .setTimestamp(Date.parse(`${sale?.created_date}Z`))
        .setFooter('Sold on OpenSea', 'https://files.readme.io/566c72b-opensea-logomark-full-colored.png')
)

function buildUri() {

    const hoursAgo = (Math.round(new Date().getTime() / 1000) - (runIntervalSeconds));

    const params = new URLSearchParams({
        offset: '0',
        event_type: 'successful',
        only_opensea: 'false',
        occurred_after: hoursAgo.toString(),
        collection_slug: process.env.COLLECTION_SLUG!,
    })

    // if (process.env.CONTRACT_ADDRESS) {
    //     params.append('asset_contract_address', process.env.CONTRACT_ADDRESS!)
    // }

    let headers = {}
    if (process.env.OPENSEA_TOKEN) {
        headers['headers'] = { 'X-API-KEY': process.env.OPENSEA_TOKEN }
    }

    let uri = "https://api.opensea.io/api/v1/events?" + params
    // uri += '&occurred_after=' + hoursAgo.toString()
    // clog.log('uri', uri)
    return { uri, headers }
}

async function check(channel: any) {

    const { uri, headers } = buildUri()
    let responseText = "";
    clog.log('running at:', dayjs().format('llll'))

    try {
        const openSeaResponseObj = await fetch(uri, headers)
        responseText = await openSeaResponseObj.text()
        const openSeaResponse = JSON.parse(responseText);
        clog.log('items:', openSeaResponse.asset_events.length)

        await Promise.all(
            openSeaResponse?.asset_events?.reverse().map(async (sale: any) => {
                clog.log('sale', formatPrice(sale.total_price))
                if (sale.asset) {
                    sale.asset?.name == sale.asset?.name || 'Unnamed NFT'
                    const message = buildMessage(sale)
                    try {
                        await channel.send(message)
                    } catch (err) {
                        clog.warn('discord error', err)
                    }
                }
            })
        );
    } catch (e) {
        const payload = responseText || "";
        if (payload.includes("cloudflare") && payload.includes("1020")) {
            throw new Error("You are being rate-limited by OpenSea. Please retrieve an OpenSea API token here: https://docs.opensea.io/reference/request-an-api-key")
        }
        throw e;
    }
}

async function main() {
    const channel = await discordSetup(process.env.DISCORD_CHANNEL_ID)

    while (true) {
        await check(channel)
        await sleepSeconds(runIntervalSeconds)
    }

}


main()
    .then((res) => {
        process.exit(0)
    })
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
