import 'dotenv/config';
import Discord, { TextChannel } from 'discord.js';
import fetch from 'node-fetch';
import { ethers } from "ethers";


const discordBot = new Discord.Client();
const  discordSetup = async (): Promise<TextChannel> => {
  return new Promise<TextChannel>((resolve, reject) => {
    ['DISCORD_BOT_TOKEN', 'DISCORD_CHANNEL_ID'].forEach((envVar) => {
      if (!process.env[envVar]) reject(`${envVar} not set`)
    })
  
    discordBot.login(process.env.DISCORD_BOT_TOKEN);
    discordBot.on('ready', async () => {
      const channel = await discordBot.channels.fetch(process.env.DISCORD_CHANNEL_ID!);
      resolve(channel as TextChannel);
    });
  })
}

const buildSaleMessage = (sale: any) => (
  new Discord.MessageEmbed()
	.setColor('#0099ff')
	.setTitle(sale.asset.name + ' sold!')
	.setURL(sale.asset.permalink)
	.setAuthor('OpenSea Bot', 'https://files.readme.io/566c72b-opensea-logomark-full-colored.png', 'https://github.com/sammybauch/discord-opensea')
	.setThumbnail(sale.asset.collection.image_url)
	.addFields(
		{ name: 'Name', value: sale.asset.name },
		{ name: 'Amount', value: `${ethers.utils.formatEther(sale.total_price)}${ethers.constants.EtherSymbol}`},
		{ name: 'Buyer', value: sale?.transaction?.to_account?.address, },
		{ name: 'Seller', value: sale?.transaction?.from_account?.address,  },
	)
  .setImage(sale.asset.image_url)
	.setTimestamp(sale.created_date) // unclear why this seems broken
	.setFooter('Sold on OpenSea', 'https://files.readme.io/566c72b-opensea-logomark-full-colored.png')
)

const buildListedMessage = (sale: any) => (
  new Discord.MessageEmbed()
	.setColor('#0099ff')
	.setTitle(sale?.asset?.name + ' listed for sale')
	.setURL(sale?.asset?.permalink)
	.setAuthor('OpenSea Bot', 'https://files.readme.io/566c72b-opensea-logomark-full-colored.png', 'https://github.com/sammybauch/discord-opensea')
	.setThumbnail(sale?.asset?.collection?.image_url)
	.addFields(
		{ name: 'Name', value: sale?.asset?.name },
		{ name: 'Amount', value: `${ethers.utils.formatEther(sale?.starting_price)}${ethers.constants.EtherSymbol}`},
		{ name: 'Seller', value: sale?.seller?.address,  },
	)
  .setImage(sale?.asset?.image_url)
	.setTimestamp(sale?.created_date) // unclear why this seems broken
	.setFooter('Listed on OpenSea', 'https://files.readme.io/566c72b-opensea-logomark-full-colored.png')
)

const buildBidMessage = (sale: any) => (
  new Discord.MessageEmbed()
	.setColor('#0099ff')
	.setTitle(sale.asset.name + ' received a bid')
	.setURL(sale.asset.permalink)
	.setAuthor('OpenSea Bot', 'https://files.readme.io/566c72b-opensea-logomark-full-colored.png', 'https://github.com/sammybauch/discord-opensea')
	.setThumbnail(sale.asset.collection.image_url)
	.addFields(
		{ name: 'Name', value: sale.asset.name },
		{ name: 'Amount', value: `${ethers.utils.formatEther(sale.bid_amount)}${ethers.constants.EtherSymbol}`},
		{ name: 'Bidder', value: sale?.from_account?.address, },
		{ name: 'Seller', value: sale?.owner?.address,  },
	)
  .setImage(sale.asset.image_url)
	.setTimestamp(sale.created_date) // unclear why this seems broken
	.setFooter('Sold on OpenSea', 'https://files.readme.io/566c72b-opensea-logomark-full-colored.png')
)

async function main() {
  const channel = await discordSetup();
  const hoursAgo = (Math.round(new Date().getTime() / 1000) - (60)); // in the last 1 minute, run every 1 min 😬
  

  // SALES
  const salesResponse = await fetch(
    "https://api.opensea.io/api/v1/events?" + new URLSearchParams({
      offset: '0',
      limit: '100',
      event_type: 'successful',
      only_opensea: 'true',
      occurred_after: hoursAgo.toString(), 
      collection_slug: process.env.COLLECTION_SLUG!,
      contract_address: process.env.CONTRACT_ADDRESS!
  })).then((resp) => resp.json());

  await Promise.all(
    salesResponse?.asset_events?.map(async (sale: any) => {
      const message = buildSaleMessage(sale);
      return channel.send(message)
    })
  );   


  // LISTINGS
  const listingsResponse = await fetch(
    "https://api.opensea.io/api/v1/events?" + new URLSearchParams({
      offset: '0',
      limit: '100',
      event_type: 'created',
      only_opensea: 'true',
      occurred_after: hoursAgo.toString(), 
      collection_slug: process.env.COLLECTION_SLUG!,
      contract_address: process.env.CONTRACT_ADDRESS!
  })).then((resp) => resp.json());

  await Promise.all(
    listingsResponse?.asset_events?.map(async (sale: any) => {
      const message = buildListedMessage(sale);
      return channel.send(message)
    })
  );   

    // BIDS
    const bidsResponse = await fetch(
      "https://api.opensea.io/api/v1/events?" + new URLSearchParams({
        offset: '0',
        limit: '100',
        event_type: 'bid_entered',
        only_opensea: 'true',
        occurred_after: hoursAgo.toString(), 
        collection_slug: process.env.COLLECTION_SLUG!,
        contract_address: process.env.CONTRACT_ADDRESS!
    })).then((resp) => resp.json());
  
    await Promise.all(
      bidsResponse?.asset_events?.map(async (sale: any) => {
        const message = buildBidMessage(sale);
        return channel.send(message)
      })
    );   
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });