// Unit tests for netlify/functions/_resend.js. fetch is injected; nothing
// here touches the network.

const test = require('node:test');
const assert = require('node:assert/strict');

const resend = require('../../designer-plan-site/netlify/functions/_resend');

const MESSAGE = {
  to: 'harper@rapqa.com',
  replyTo: 'designer@rapqa.com',
  subject: 'Harper Studio sent you your Designer Plan link',
  text: 'Hi Harper',
  html: '<p>Hi Harper</p>'
};

function fetchReplying(status, json) {
  const fn = async (url, init) => {
    fn.calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      async text() { return JSON.stringify(json); }
    };
  };
  fn.calls = [];
  return fn;
}

test('_resend', async (t) => {
  await t.test('isConfigured reads RESEND_API_KEY at call time', () => {
    const saved = process.env.RESEND_API_KEY;
    try {
      delete process.env.RESEND_API_KEY;
      assert.equal(resend.isConfigured(), false);
      process.env.RESEND_API_KEY = '';
      assert.equal(resend.isConfigured(), false);
      process.env.RESEND_API_KEY = 're_unit_test';
      assert.equal(resend.isConfigured(), true);
    } finally {
      if (saved === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved;
    }
  });

  await t.test('sendEmail throws email_not_configured without a key and never calls fetch', async () => {
    const saved = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const fetchImpl = fetchReplying(200, { id: 'x' });
    try {
      await assert.rejects(
        () => resend.sendEmail(MESSAGE, { fetchImpl }),
        (err) => err.code === 'email_not_configured'
      );
      assert.equal(fetchImpl.calls.length, 0);
    } finally {
      if (saved !== undefined) process.env.RESEND_API_KEY = saved;
    }
  });

  await t.test('sendEmail posts the Resend payload and returns the id', async () => {
    const fetchImpl = fetchReplying(200, { id: 'msg-123' });
    const out = await resend.sendEmail(MESSAGE, { fetchImpl, apiKey: 're_unit_test' });
    assert.deepEqual(out, { id: 'msg-123' });

    assert.equal(fetchImpl.calls.length, 1);
    const { url, init } = fetchImpl.calls[0];
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer re_unit_test');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(init.body), {
      from: 'Designer Plan <no-reply@send.thedesignerplan.com>',
      to: ['harper@rapqa.com'],
      reply_to: 'designer@rapqa.com',
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html
    });
  });

  await t.test('sendEmail throws email_failed with the status on a non-2xx', async () => {
    const fetchImpl = fetchReplying(422, { message: 'invalid to' });
    await assert.rejects(
      () => resend.sendEmail(MESSAGE, { fetchImpl, apiKey: 're_unit_test' }),
      (err) => err.code === 'email_failed' && err.status === 422
    );
  });

  await t.test('sendEmail throws email_failed when fetch itself fails', async () => {
    const fetchImpl = async () => { throw new Error('ECONNRESET'); };
    await assert.rejects(
      () => resend.sendEmail(MESSAGE, { fetchImpl, apiKey: 're_unit_test' }),
      (err) => err.code === 'email_failed'
    );
  });

  await t.test('FROM is the verified sending domain', () => {
    assert.equal(resend.FROM, 'Designer Plan <no-reply@send.thedesignerplan.com>');
  });
});
