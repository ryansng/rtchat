import { FirestoreStore } from "@google-cloud/connect-firestore";
import { Firestore } from "@google-cloud/firestore";
import * as crypto from "crypto";
import * as express from "express";
import * as expressSession from "express-session";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import fetch from "node-fetch";
import { AuthorizationCode } from "simple-oauth2";
import {
  STREAMLABS_OAUTH_CONFIG,
  TWITCH_CLIENT_ID,
  TWITCH_OAUTH_CONFIG,
} from "./oauth";

const app = express();

app.use(
  expressSession({
    store: new FirestoreStore({
      dataset: new Firestore(),
      kind: "express-sessions",
    }),
    name: "__session",
    secret: functions.config().express.secret,
    resave: true,
    saveUninitialized: true,
    rolling: true,
    cookie: { maxAge: 60000, secure: "auto", httpOnly: true },
  })
);

declare module "express-session" {
  interface Session {
    state?: string;
    token?: string;
    provider?: string;
  }
}

const HOST =
  process.env.NODE_ENV === "production"
    ? "https://chat.rtirl.com"
    : "http://localhost:5000";

app.get("/auth/twitch/redirect", (req, res) => {
  const state = req.session.state || crypto.randomBytes(20).toString("hex");
  req.session.state = state.toString();
  const redirectUri = new AuthorizationCode(TWITCH_OAUTH_CONFIG).authorizeURL({
    redirect_uri: `${HOST}/auth/twitch/callback`,
    scope: [
      "channel_editor",
      "channel_commercial",
      "bits:read",
      "chat:read",
      "chat:edit",
      "channel:moderate",
      "channel:manage:broadcast",
      "channel:manage:polls",
      "channel:manage:predictions",
      "channel:read:hype_train",
      "channel:read:subscriptions",
      "channel:read:redemptions",
      "moderation:read",
      "user:read:email",
      "user:read:follows",
    ],
    state: state,
  });
  res.redirect(`${redirectUri}&force_verify=true`);
});

app.get("/auth/twitch/callback", async (req, res) => {
  if (!req.session?.state || req.session.state !== req.session.state) {
    res.redirect("/auth/twitch/redirect");
    return;
  }
  const results = await new AuthorizationCode(TWITCH_OAUTH_CONFIG).getToken({
    code: String(req.query.code),
    redirect_uri: `${HOST}/auth/twitch/callback`,
  });

  const users = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      Authorization: `Bearer ${results.token.access_token}`,
      "Client-Id": TWITCH_CLIENT_ID,
    },
  }).then((response) => response.json());

  req.session.state = undefined;

  const twitchUserId = users["data"][0]["id"];
  const email = users["data"][0]["email"];

  // check if this user exists already.
  const userIdRef = admin
    .database()
    .ref("userIds")
    .child("twitch")
    .child(twitchUserId);
  const firebaseUserIdDoc = await userIdRef.get();
  let firebaseUserId = firebaseUserIdDoc.val();
  if (!firebaseUserId) {
    const userRecord = await admin.auth().createUser({});
    await userIdRef.set(userRecord.uid);
    firebaseUserId = userRecord.uid;
  }

  // save the token to the user doc.
  await admin
    .firestore()
    .collection("tokens")
    .doc(firebaseUserId)
    .set({ twitch: JSON.stringify(results.token) }, { merge: true });

  // save the profile information too.
  const twitchProfile: any = {
    id: users["data"][0]["id"],
    displayName: users["data"][0]["display_name"],
    login: users["data"][0]["login"],
    profilePictureUrl: users["data"][0]["profile_image_url"],
  };

  if (email) {
    // Twitch accounts can be verified by phone and have no email
    twitchProfile.email = email;
  }

  await admin
    .firestore()
    .collection("profiles")
    .doc(firebaseUserId)
    .set({ twitch: twitchProfile }, { merge: true });

  const token = await admin.auth().createCustomToken(firebaseUserId);

  res.redirect("com.rtirl.chat://success?token=" + encodeURIComponent(token));
});

app.get("/auth/streamlabs/redirect", (req, res) => {
  req.session.token = req.query.token?.toString();
  req.session.provider = req.query.provider?.toString();
  const redirectUri = new AuthorizationCode(
    STREAMLABS_OAUTH_CONFIG
  ).authorizeURL({
    redirect_uri: `${HOST}/auth/streamlabs/callback`,
    scope: ["donations.read"],
  });
  res.redirect(redirectUri);
});

async function toUserId(token?: string) {
  if (!token) {
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.uid;
  } catch (e) {
    return null;
  }
}

app.get("/auth/streamlabs/callback", async (req, res) => {
  const provider = req.session.provider;
  const uid = await toUserId(req.session.token);
  if (!uid || !provider) {
    res.redirect("com.rtirl.chat://error?message=invalid_token");
    return;
  }
  const results = await new AuthorizationCode(STREAMLABS_OAUTH_CONFIG).getToken(
    {
      code: String(req.query.code),
      redirect_uri: `${HOST}/auth/streamlabs/callback`,
    }
  );
  const usernameDoc = await admin
    .firestore()
    .collection("profiles")
    .doc(uid)
    .get();

  const channelId = `${provider}:${usernameDoc.get(provider)["id"]}`;

  admin
    .firestore()
    .collection("streamlabs")
    .doc(uid)
    .set({ token: JSON.stringify(results.token), channelId }, { merge: true });

  res.redirect("com.rtirl.chat://success?token=1");
});

export { app };
