import {CaptureMetadata, MessageInfo} from "./types";
import { fetchMessageInfo } from "./fetchSlack";

let color = '#3aa757';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ color });
  console.log('Default background color set to %cgreen', `color: ${color}`);
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove(["token", "captureMetadata"]);
});

// This extension probably needs to be force-installed to use
// chrome.webRequest.
// https://developer.chrome.com/docs/extensions/reference/webRequest/
//
// The new API chrome.declarativeNetRequest doesn't let you see
// request content.

// Block stars.add and stars.remove.
// Get the auth token from the requests and pass it to the other process.
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    const form = details.requestBody.formData;
    if (form) {
      const token = form.token[0];
      if (token) {
        console.log("Have token from stars listener");
        chrome.storage.local.set({ token });
      }
    }
    return { cancel: true };
  },
  {urls: ["https://*.slack.com/api/stars.*"]},
  [ "blocking", "requestBody" ]
);

// chrome.storage.onChanged.addListener((changes, namespace) => {
//   for (var key in changes) {
//     var storageChange = changes[key];
//     console.log('Storage key "%s" in namespace "%s" changed. ' +
//                 'Old value was "%s", new value is "%s".',
//                 key,
//                 namespace,
//                 storageChange.oldValue,
//                 storageChange.newValue);
//   }
// });

chrome.storage.onChanged.addListener(changes => {
  if (changes.captureMetadata?.newValue || changes.token?.newValue) {
    chrome.storage.local.get(["token", "captureMetadata"], async items => {
      if (await doCapture(items.captureMetadata, items.token)) {
        chrome.storage.local.remove("captureMetadata");
      }
    });
  }
});

//////////////////////////////////////////////////////////////////////

function makeMessageURL(meta: CaptureMetadata): string {
  // example:
  // https://rvl-test.slack.com/archives/CLEHCKMQW/p1616409584000200
  // {button: "save", channelId: "CLEHCKMQW", ts: "1616409584.000200", messageContainerType: "message-pane"}
  const msg = "p" + meta.ts.replace(".", "");
  return `${location.protocol}//${location.hostname}/archives/${meta.channelId}/${msg}`;
}

function orgProtocolURI(params: { [key: string]: string }): string {
  const scheme = "org-protocol://";
  const method = "capture";
  const query = Object.keys(params).map(key => {
    const value = params[key];
    return value ? (key + "=" + encodeURIComponent(value)) : ""
  }).filter(p => !!p).join("&");
  return scheme + method + "?" + query;
}

async function doCapture(captureMetadata?: CaptureMetadata, token?: string): Promise<boolean> {
  if (captureMetadata && token) {
    console.log("captureMetadata", captureMetadata);
    console.log("token", token);

    const msg = await fetchMessageInfo(captureMetadata, token);
    // const msg = { permalink: makeMessageURL(captureMetadata), content: "", author: "" }
    console.log("Message info", msg);

    const uri = await getCaptureURI(msg);
    console.log("URI: " + uri);
    chrome.tabs.query({currentWindow: true, active: true}, tabs => {
      chrome.tabs.update((tabs[0].id as number), {url: uri});
    });
    return true;
  }
  return false;
}

async function getCaptureURI(msg: MessageInfo) {
  const params = {
    url: msg.permalink,
    // template: "S",
    title: `Slack message from ${msg.author}`,
    body: msg.content
  };

  return orgProtocolURI(params);
}