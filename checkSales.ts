import 'dotenv/config';
import Discord, { TextChannel } from 'discord.js';
import fetch from 'node-fetch';
import { ethers } from "ethers";

const OPENSEA_SHARED_STOREFRONT_ADDRESS = '0x495f947276749Ce646f68AC8c248420045cb7b5e';

const discordBot = new Discord.Client();

class MockChannel {
  send(message: any) {
    console.log(message);
  }
}

const discordSetup = async (): Promise<TextChannel | MockChannel> => {

  return new Promise<TextChannel | MockChannel>((resolve, _reject) => {
    if (!process.env['DISCORD_BOT_TOKEN'] || !process.env['DISCORD_CHANNEL_ID']) {
      console.warn(`Discord API keys not set. Logging instead`)
      return resolve(new MockChannel());
    }

    discordBot.login(process.env.DISCORD_BOT_TOKEN);
    discordBot.on('ready', async () => {
      const channel = await discordBot.channels.fetch(process.env.DISCORD_CHANNEL_ID!);
      resolve(channel as TextChannel);
    });
  })
}

const buildMessage = (sale: any) => (
  new Discord.MessageEmbed()
    .setColor('#0099ff')
    .setTitle(sale.asset.name + ' sold!')
    .setURL(sale.asset.permalink)
    .setAuthor('OpenSea Bot', 'https://files.readme.io/566c72b-opensea-logomark-full-colored.png', 'https://github.com/sbauch/opensea-discord-bot')
    .setThumbnail(sale.asset.collection.image_url)
    .addFields(
      { name: 'Name', value: sale.asset.name },
      { name: 'Amount', value: `${ethers.utils.formatEther(sale.total_price || '0')}${ethers.constants.EtherSymbol}` },
      { name: 'Buyer', value: sale?.winner_account?.address, },
      { name: 'Seller', value: sale?.seller?.address, },
    )
    .setImage(sale.asset.image_url)
    .setTimestamp(Date.parse(`${sale?.created_date}Z`))
    .setFooter('Sold on OpenSea', 'https://files.readme.io/566c72b-opensea-logomark-full-colored.png')
)

async function main() {
  const channel = await discordSetup();
  const seconds = process.env.SECONDS ? parseInt(process.env.SECONDS) : 3_600;
  const hoursAgo = (Math.round(new Date().getTime() / 1000) - (seconds)); // in the last hour, run hourly?

  const params = new URLSearchParams({
    offset: '0',
    event_type: 'successful',
    only_opensea: 'false',
    occurred_after: hoursAgo.toString(),
    collection_slug: process.env.COLLECTION_SLUG!,
  })

  if (process.env.CONTRACT_ADDRESS !== OPENSEA_SHARED_STOREFRONT_ADDRESS) {
    params.append('asset_contract_address', process.env.CONTRACT_ADDRESS!)
  }

  let openSeaFetch = {}
  if (process.env.OPENSEA_API_TOKEN) {
    openSeaFetch["headers"] = { "X-API-KEY": process.env.OPENSEA_API_TOKEN }
  } else {
    console.debug("No OpenSea API token")
  }

  let responseText = "";

  try {
    const openSeaResponseObj = await fetch(
      "https://api.opensea.io/api/v1/events?" + params, openSeaFetch
    );

    responseText = await openSeaResponseObj.text();
    const openSeaResponse = JSON.parse(responseText);
    if (openSeaResponse.asset_events === undefined) {
      console.error("Unexpected OpenSea response:", openSeaResponse);
    }

    return await Promise.all(
      openSeaResponse?.asset_events?.reverse().map(async (sale: any) => {
        if (sale.asset.name == null) sale.asset.name = 'Unnamed NFT';
        const message = buildMessage(sale);
        return await channel.send(message);
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

main()
  .then((res) => {
    if (!res.length) console.log("No recent sales")
    process.exit(0)
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
