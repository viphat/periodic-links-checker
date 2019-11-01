const axios = require('axios');
const cheerio = require('cheerio');
const { SLACK_WEBHOOK_URL, TARGET_URL, CHANNEL_NAME } = process.env;
// const slackNotifier = require('slack-notify')(SLACK_WEBHOOK_URL);
const slackNotifier = require('./node_modules/slack-notify/slack-notify.js')(SLACK_WEBHOOK_URL);

const APP_ICON_URL = 'https://s3-ap-northeast-1.amazonaws.com/sw-misc/sharewis3_app.png';

const isBlank = (variable) => {
  return variable === null || variable === undefined || variable === '';
}

const fullUrlConverter = (src) => {
  try {
    return new URL(src).href;
  } catch (error) {
    const base_url = new URL(TARGET_URL);
    const { protocol, origin, host } = base_url;
    if (src.includes(host)) {
      return `${protocol}:${src}`;
    } else {
      return new URL(src, origin).href;
    }
  }
}

const parseHtml = async (htmlData) => {
  return new Promise((resolve, reject) => {
    let $ = cheerio.load(htmlData);
    const fetchedUrls = [];

    // Check all javascript files
    $('script[src]').each((index, el) => {
      let $el = $(el);
      if (!isBlank($el.attr('src'))) {
        fetchedUrls.push(fullUrlConverter($el.attr('src')));
      }
    });

    // Check all css files
    $('link[href]').each((index, el) => {
      let $el = $(el);
      if (!isBlank($el.attr('href'))) {
        fetchedUrls.push(fullUrlConverter($el.attr('href')));
      }
    });

    // Check all image files
    $('img[src]').each((index, el) => {
      let $el = $(el);
      if (!isBlank($el.attr('src'))) {
        fetchedUrls.push(fullUrlConverter($el.attr('src')));
      }
    });

    resolve(fetchedUrls);
  });
}

const checkUrlsStatusCode = async(fetchedUrls) => {
  return new Promise(async (resolve, reject) => {
    const brokenUrls = [];

    await Promise.all(fetchedUrls.map(async (url) => {
      const result = await checkUrlStatusCode(url)
      if (!result) {
        brokenUrls.push(url);
      }}));

    resolve(brokenUrls);
  })
}

const checkUrlStatusCode = async (url) => {
  return new Promise(async (resolve, reject) => {
    try {
      await axios.get(url);
      resolve(true);
    } catch (error) {
      resolve(false);
    }
  });
}

const notifyOnSlack = ({ textMessage }) => {
  console.log(textMessage);

  return new Promise((resolve, reject) => {
    resolve(
      slackNotifier.send({
        channel: CHANNEL_NAME,
        icon_url: APP_ICON_URL,
        text: textMessage,
        username: 'ShareWis Links Checker - Node.js'
      })
    );
  });
}

const mainProcess = async () => {
  if (isBlank(TARGET_URL)) {
    console.log("Can't read TARGET_URL from Environment Variables");
    return;
  }

  if (isBlank(SLACK_WEBHOOK_URL)) {
    console.log("Can't read SLACK_WEBHOOK_URL from Environment Variables");
  }

  if (isBlank(CHANNEL_NAME)) {
    console.log("Can't read CHANNEL_NAME from Environment Variables");
  }

  console.log(TARGET_URL);
  console.log(CHANNEL_NAME);

  try {
    const response = await axios.get(TARGET_URL);
    const fetchedUrls = await parseHtml(response.data);
    const brokenUrls = await checkUrlsStatusCode(fetchedUrls);
    console.log(brokenUrls);

    if (brokenUrls.length !== 0) {
      const textMessage = `:bug::bug::bug:\n*${fetchedUrls.length}* links on ${TARGET_URL} were checked.\nHowever, some links are inaccessible:\n${brokenUrls.join(",\n")}\n:bug::bug::bug:`

      return await notifyOnSlack({ textMessage: textMessage });
    }
  } catch (error) {
    return await notifyOnSlack({ textMessage: `:skull: :bug: :skull: - Error occurred when accessing ${TARGET_URL} - ErrorCode: ${error.code} - :bug: :skull: :bug:` });
  }
}

exports.handler = async (event) => {
  await mainProcess();

  return {
    statusCode: 200,
    body: JSON.stringify({}),
  }
};

mainProcess();
