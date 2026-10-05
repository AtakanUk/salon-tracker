/** Sends a test mail. Used by the `friseur` menu: docker compose exec app node server/dist/tools/test-mail.js */
import { mailConfigured, sendMail } from '../lib/mailer.js';

if (!mailConfigured()) {
  console.error('Email is not set up: fill in SMTP_HOST/SMTP_USER/SMTP_PASS/ALERT_TO in .env.');
  process.exit(1);
}

const result = await sendMail({
  subject: 'Friseur – test mail',
  text: 'This is a test mail. Alerts and backup mails will arrive at this address.',
});

if (result.sent) {
  console.log('Mail sent ✓');
} else {
  console.error(`Mail could not be sent: ${result.error}`);
  process.exit(1);
}
