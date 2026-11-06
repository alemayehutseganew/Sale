# YogaBingo Telegram Mini App Manual QA

Use a Telegram test account and a non-production environment. Record the app version, device, Telegram client, and any errors in the browser/Web App console.

## Automated test setup

Set `DATABASE_URL` to a disposable PostgreSQL database whose database name contains `test` (for example, `yogabingo_test`) and whose schema has already been migrated. The Jest setup refuses non-test database names and does not run migrations because the historical migration `010_reset_all_balances.js` resets every user balance. Then run `npm test` from `backend/`.

## 1. Bot startup, invite, and language

1. Open the YogaBingo bot in a private chat and send `/start`.
2. Verify Telegram displays the welcome/language choices and the game and invite actions.
3. Select **English**. Open the game, confirm the lobby is in English, then return to the bot and send `/menu`.
4. Select **አማርኛ** and verify the corresponding bot and Mini App labels change to Amharic.
5. Send `/invite` and `/refer`. Verify each response contains an invite link and a **Share to Group/Channel** button.
6. Tap the share button, choose a test chat, and confirm the composed message includes the invite link.
7. Open the invite link from a second test account. Complete Mini App login and verify the new account appears under the inviter’s invited players.

## 2. Referral sharing from the Mini App

1. Open the Mini App as a registered user and navigate to the agent/referral dashboard.
2. Confirm the displayed Telegram username/ID and referral link belong to the signed-in user.
3. Use **Copy Bot Link** and paste it into a private test chat. Open it and verify Telegram opens the configured bot with the referral start payload.
4. Use **Share to Group** and select a test group. Confirm the shared link targets the same bot and carries the same referral identity.
5. Join through the shared link with a new test account. Verify the inviter attribution appears once; repeat login as that same account and confirm it is not counted as a second referral.

## 3. Wallet and agent balances

1. Open **Wallet** and record the playable balance. Compare it with the test account’s backend wallet balance.
2. Open **Agent Dashboard** and record the referral balance and total-earned value.
3. Confirm the agent balance progress bar uses 1,000 ETB as its withdrawal threshold and caps its visual progress at 100%.
4. With referral earnings below 1,000 ETB, attempt a referral withdrawal and verify the UI explains the threshold.
5. In a test environment, raise the referral balance above the threshold and submit a smaller valid withdrawal. Verify it appears as pending and the displayed balance reflects the debit.
6. Submit a wallet withdrawal and confirm it does not change the referral balance.

## 4. Bingo gameplay

1. Join a test room with at least two funded test accounts and select different cards.
2. Confirm the room countdown appears and the same called-ball sequence is visible to both players.
3. Click a number that has been called. Verify the corresponding card cell is shaded/marked.
4. Click an uncalled number. Verify it does not become a valid mark.
5. Attempt Bingo before completing a winning pattern. Verify the game rejects the claim and remains active.
6. In a controlled test round where a valid row, column, diagonal, or supported pattern has been called, mark only the called card numbers and claim Bingo.
7. Verify the winner message, payout, platform fee, inviter commission (when applicable), and wallet updates match the test ledger entries.
8. Repeat with an empty mark list and with fabricated/un-called marks; both claims must be rejected.

## 5. Admin withdrawals and refunds

1. Open `/admin` in the test deployment and log in with the designated test admin credentials.
2. Open pending payments/withdrawals and locate the test withdrawal created above.
3. Approve one pending withdrawal. Verify its status changes to approved/completed and no second approval is possible.
4. Create another test withdrawal and reject it. Verify the rejection reason/status is visible.
5. Confirm the rejected amount is refunded to the correct balance source (wallet or referral), and inspect the financial ledger for a matching reversal.
6. Verify neither action changes another user’s balance or payment record.

## Known acceptance checks to watch

- The current backend does not authenticate `GET /api/wallet/balance` and `POST /api/rooms/join` trusts a body-supplied `userId`; corresponding automated regression tests are expected to fail until those protections exist.
- The backend currently emits `new_number_called`, `game_in_progress`, and `game_ended_for_spectators`; it does not emit the requested `number_called`, `bingo_valid`, `sync_game_state`, or no-winner `game_over` event shape. It also does not refund stakes after ball exhaustion. Treat these automated test failures as release blockers.
- Treat any mismatch in referral attribution, balance source, payout, withdrawal approval, or rejection refund as a release blocker. Automated integration tests for these flows live under `backend/tests/`.
