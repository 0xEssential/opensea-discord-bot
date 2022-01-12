import 'dotenv/config';
import Discord, { TextChannel } from 'discord.js';
import fetch from 'node-fetch';
import { ethers } from "ethers";
import filter from './asset-name-filter.json';

const OPENSEA_SHARED_STOREFRONT_ADDRESS = '0x495f947276749Ce646f68AC8c248420045cb7b5e';

const discordBot = new Discord.Client();
const  discordSetup = async (channel: string): Promise<TextChannel> => {
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

const buildMessage = (sale: any) => (
  new Discord.MessageEmbed()
	.setColor('#0099ff')
	.setTitle(sale.asset.name + ' sold!')
	.setURL(sale.asset.permalink)
	.setAuthor('OpenSea Bot', 'https://files.readme.io/566c72b-opensea-logomark-full-colored.png', 'https://github.com/sbauch/opensea-discord-bot')
	.setThumbnail(sale.asset.collection.image_url)
	.addFields(
		{ name: 'Name', value: sale.asset.name },
		{ name: 'Amount', value: `${ethers.utils.formatEther(sale.total_price || '0')}${ethers.constants.EtherSymbol}`},
		{ name: 'Buyer', value: sale?.winner_account?.address, },
		{ name: 'Seller', value: sale?.seller?.address,  },
	)
  .setImage(sale.asset.image_url)
	.setTimestamp(Date.parse(`${sale?.created_date}Z`))
	.setFooter('Sold on OpenSea', 'https://files.readme.io/566c72b-opensea-logomark-full-colored.png')
)

async function main() {
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
  if (process.env.OPENSEA_TOKEN) {
    openSeaFetch['headers'] = {'X-API-KEY': process.env.OPENSEA_TOKEN}
  }

  let responseText = "";

  try {
    const openSeaResponseObj = await fetch(
      "https://api.opensea.io/api/v1/events?" + params, openSeaFetch
    );

    responseText = await openSeaResponseObj.text();

    const openSeaResponse = JSON.parse(responseText);

    return await Promise.all(
      openSeaResponse?.asset_events?.reverse().map(async (sale: any) => {
        
        if (sale.asset.name == null) sale.asset.name = 'Unnamed NFT';
        
        // filter for asset name
        if(filter['asset-name'].includes(sale.asset.name)){
          const message = buildMessage(sale);
          return channel.send(message)
        }

        return await Promise.all(
          process.env.DISCORD_CHANNEL_ID.split(';').map(async (channel: string) => {
            return await (await discordSetup(channel)).send(message)
          })
        );
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
  .then((res) =>{ 
    if (!res.length) console.log("No recent sales")
    process.exit(0)
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
