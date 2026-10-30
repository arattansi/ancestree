import { initBotId } from "botid/client/core";

// Vercel BotID (Step 217.3): a birthday card's link takes signatures from
// anyone signed out, so its writes carry BotID's proof; the routes check it
// (`notABot`). Basic checks, as on every plan.
initBotId({
  protect: [
    { path: "/api/cards/upload", method: "POST" },
    { path: "/api/cards/sign", method: "POST" },
    { path: "/api/cards/join", method: "POST" },
  ],
});
