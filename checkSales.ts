import 'dotenv/config';
import Discord, { TextChannel } from 'discord.js';
import fetch from 'node-fetch';
import { ethers } from "ethers";
import * as fs from 'fs';

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

const buildMessage = (sale: any) =>
  new Discord.MessageEmbed()
    .setColor("#0099ff")
    .setTitle(sale.nft.name + " sold!")
    .setURL(
      `https://opensea.io/assets/${sale.chain}/${sale.nft.contract}/${sale.nft.identifier}`
    )
    .setAuthor(
      "OpenSea Bot",
      "https://files.readme.io/566c72b-opensea-logomark-full-colored.png",
      "https://github.com/sbauch/opensea-discord-bot"
    )
    .setThumbnail(process.env.COLLECTION_IMAGE_URL || sale.nft.image_url)
    .addFields(
      { name: "Name", value: sale.nft.name },
      {
        name: "Amount",
        value: `${ethers.utils.formatEther(BigInt(sale.payment.quantity || 0))}${
          ethers.constants.EtherSymbol
        }`,
      },
      { name: "Buyer", value: sale.buyer },
      { name: "Seller", value: sale.seller }
    )
    .setImage(sale.nft.image_url)
    .setTimestamp(new Date(sale.closing_date * 1000))
    .setFooter(
      "Sold on OpenSea",
      "https://files.readme.io/566c72b-opensea-logomark-full-colored.png"
    );

async function main() {
  const channel = await discordSetup();
  // Either load sinceTimestamp for file or check in the last hour
  const currentTimestamp = (new Date()).getTime();
  let sinceTimestamp: number;
  if (fs.existsSync('last_synced')) {
    sinceTimestamp = parseInt(fs.readFileSync('last_synced', 'utf-8'));
    console.log(`Syncing: last timestamp found, syncing from ${sinceTimestamp} (${(new Date(sinceTimestamp)).toISOString()})`);
  } else {
    sinceTimestamp = currentTimestamp - 3_600 * 1000;
    console.log(`Syncing: last timestamp not found, syncing for last hour (from ${sinceTimestamp})`);
  }

  const params = new URLSearchParams({
    event_type: 'sale'
    // Note: OpenSea no longer supports occurred_after, so we need to manually prune
  })

  let openSeaFetch = {
    "headers": { "Accept": "application/json" },
  }
  if (process.env.OPENSEA_API_TOKEN) {
    openSeaFetch["headers"]["X-API-KEY"] = process.env.OPENSEA_API_TOKEN;
  } else {
    console.debug("No OpenSea API token")
  }

  let responseText = "";

  try {
    const url = "https://api.opensea.io/api/v2/events/collection/" + process.env.COLLECTION_SLUG! + "?" + params;
    const openSeaResponseObj = await fetch(url, openSeaFetch);

    responseText = await openSeaResponseObj.text();
    let r;
    try {
      r = JSON.parse(responseText);
    } catch (err) {
      throw new Error("Failed to parse OpenSea response: " + url + " \n" + responseText);
    }
    if (r.asset_events === undefined) {
      throw new Error("Unexpected OpenSea response: " + url + " => " + JSON.stringify(r));
    }

    let latestSaleTimestamp: number;
    const promises = [];
    for (const sale of r.asset_events) {
      const ts = sale.start_date * 1000; // Fix their broken ISO UTC string (otherwise parses as local timezone)
      if (latestSaleTimestamp === undefined) {
        latestSaleTimestamp = ts + 1;
      }
      if (ts < sinceTimestamp) {
        // Reached stale events, bail
        break
      }
      if (sale.nft.name == null) sale.nft.name = 'Unnamed NFT';
      const message = buildMessage(sale);
      promises.push(channel.send(message));
    }

    console.log(`Loaded ${r.asset_events.length} asset events, ${promises.length} recent, latest is ${latestSaleTimestamp}`);

    // FIXME: This does not paginate, if there's tons of sales with additional
    // pages then we'll only return the first page.

    latestSaleTimestamp ||= currentTimestamp;
    console.log(`Syncing: saving timestamp ${latestSaleTimestamp}`);
    fs.writeFileSync('last_synced', latestSaleTimestamp.toString())

    return await Promise.all(promises);
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
