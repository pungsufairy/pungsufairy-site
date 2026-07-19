// /api/send-confirmation.js
// Vercel 서버리스 함수 — 3개 채널을 독립적으로 실행합니다:
//   1) 고객 확인 이메일 (Resend)
//   2) 관리자 알림 이메일 — PDF 생성용 JSON 포함 (Resend)
//   3) 고객 알림 문자 LMS (Solapi)
//
// ★ 한 채널이 실패해도 나머지는 계속 실행됩니다.
//
// 필요 환경변수:
//   RESEND_API_KEY, ADMIN_EMAIL,
//   SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER

import { Resend } from 'resend';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);

// ─────────────────────────────────────────────
// 헬퍼: PDF 생성용 JSON
// ─────────────────────────────────────────────
function buildBirthJson(birth) {
  if (!birth || !birth.year || !birth.month || !birth.day) return null;

  // 생시(生時)는 절대 임의값(12시)으로 채우지 않는다.
  // 모르거나 미입력이면 null로 두고 관리자에게 경고를 띄운다.
  // (임의로 12시를 넣으면 시주가 통째로 틀린 리포트가 나감)
  const hasTime = !birth.timeUnknown
    && birth.hour !== undefined && birth.hour !== null && birth.hour !== '';

  return JSON.stringify({
    year: birth.year, month: birth.month, day: birth.day,
    hour: hasTime ? Number(birth.hour) : null,
    minute: hasTime ? Number(birth.minute ?? 0) : null,
    timeUnknown: !hasTime,
    gender: birth.gender || 'M',
    isLunar: !!birth.isLunar,
    name: birth.name || '',
    trueSolarTime: false,
  }, null, 2);
}

// 생시 확인이 필요한 주문인지 판정 (관리자 경고용)
function needsTimeCheck(birth) {
  if (!birth) return true;
  if (birth.timeUnknown) return true;
  if (birth.hour === undefined || birth.hour === null || birth.hour === '') return true;
  return false;
}

// ─────────────────────────────────────────────
// Solapi HMAC 인증 헤더
// ─────────────────────────────────────────────
function getSolapiAuthHeader() {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(date + salt)
    .digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

// ─────────────────────────────────────────────
// LMS 발송
// ─────────────────────────────────────────────
async function sendLMS({ to, name, productTitle, price }) {
  const from = process.env.SOLAPI_SENDER;
  if (!from) throw new Error('SOLAPI_SENDER 환경변수 없음');

  const text = `[달빛사주] ${name ? name + '님 ' : ''}접수 완료

▶ 상품: ${productTitle}
▶ 결제 금액: ${price || ''}

▶ 무통장 입금 (카카오뱅크)
계좌: 3333-19-7175327
예금주: 정승모

※ 안내사항
· 입금 확인 후 24시간 내 이메일로 리포트 전달
· 입금자명은 접수하신 성함으로 부탁드립니다
· 문의: pungsufairy.com/saju

- 달빛사주 드림`;

  const res = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: {
      Authorization: getSolapiAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: { to, from, text, subject: '[달빛사주] 접수 완료', type: 'LMS' },
    }),
  });

  const json = await res.json();
  if (!res.ok || json.statusCode !== '2000') {
    throw new Error(json.statusMessage || 'LMS 발송 실패');
  }
  return json;
}

// ─────────────────────────────────────────────
// 고객 확인 이메일
// ─────────────────────────────────────────────
async function sendCustomerEmail({ email, name, productTitle, price, now }) {
  const { data, error } = await resend.emails.send({
    from: '달빛사주 <onboarding@resend.dev>',
    to: [email],
    subject: `달빛사주 사주풀이 - ${name ? name + '님 ' : ''}${productTitle}`,
    html: `
      <div style="font-family:'Apple SD Gothic Neo',sans-serif;max-width:480px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(90deg,#6C63C7,#5dcfb0);padding:22px;">
          <p style="color:#fff;text-align:center;font-weight:bold;margin:0;font-size:14px;">"확신은 아니지만, 확률을 높입니다"</p>
        </div>
        <div style="padding:28px 24px;">
          <p>${name ? name + '님,' : '안녕하세요,'}</p>
          <p><b>달빛사주 ${productTitle}</b> 접수가 완료되었습니다.</p>
          <p>결제 확인 후 사주풀이가 시작됩니다.<br><b>24시간 내 이 이메일로 전달드립니다.</b></p>
          <div style="background:#f5f5f9;padding:14px 18px;border-radius:8px;margin:18px 0;font-size:13.5px;line-height:1.8;">
            접수 시간: ${now}<br>
            리포트 종류: ${productTitle}<br>
            결제 금액: <b>${price || ''}</b>
          </div>
          <div style="background:#fffbf0;border:1px solid #f0d787;border-radius:8px;padding:16px 18px;margin:18px 0;font-size:13.5px;line-height:1.8;">
            <p style="margin:0 0 8px;font-weight:bold;color:#8a5a00;">무통장 입금 안내</p>
            은행: <b>카카오뱅크</b><br>
            계좌번호: <b>3333-19-7175327</b><br>
            예금주: <b>정승모</b>
            <p style="margin:10px 0 0;font-size:12px;color:#8a5a00;">입금 확인 후 24시간 내에 리포트를 이 메일로 전달드립니다.</p>
          </div>
          <p style="text-align:center;color:#888;font-size:13px;margin-top:24px;">감사합니다.<br>- 달빛사주 드림</p>
        </div>
      </div>
    `,
  });
  if (error) throw new Error(error.message || '고객 이메일 발송 실패');
  return data;
}

// ─────────────────────────────────────────────
// 관리자 알림 이메일
// ─────────────────────────────────────────────
async function sendAdminEmail({ email, phone, name, productTitle, price,
                                 birth, partner, subChoice, concerns, source, referrer, now }) {
  if (!process.env.ADMIN_EMAIL) throw new Error('ADMIN_EMAIL 환경변수 없음');

  const birthJson = buildBirthJson(birth);
  const partnerJson = partner ? JSON.stringify(partner, null, 2) : null;
  const timeWarning = needsTimeCheck(birth);

  // 추천인이 있으면 눈에 띄게 표시 (적립 관리용)
  const referrerHtml = (referrer && referrer.trim())
    ? `<div style="background:#eef7f0;border:2px solid #6bbd86;border-radius:8px;padding:14px 18px;margin:18px 0;">
         <p style="margin:0 0 6px;font-weight:bold;color:#1f7a44;font-size:15px;">[추천] 추천인 적립 대상</p>
         <p style="margin:0;font-size:15px;line-height:1.7;color:#20502f;">
           추천인: <b style="font-size:17px;">${referrer}</b><br>
           <span style="font-size:12.5px;">이 추천인에게 <b>1회 적립</b>하세요. (5회 = 리포트 1회 무료)</span>
         </p>
       </div>`
    : '';

  const timeWarningHtml = timeWarning
    ? `<div style="background:#fff3f3;border:2px solid #e05a5a;border-radius:8px;padding:14px 18px;margin:18px 0;">
         <p style="margin:0 0 6px;font-weight:bold;color:#c62828;font-size:15px;">[!] 생시(태어난 시간) 확인 필요</p>
         <p style="margin:0;font-size:13.5px;line-height:1.7;color:#7a2020;">
           고객이 태어난 시간을 <b>입력하지 않았거나 '모름'</b>으로 접수했습니다.<br>
           <b>임의로 12시 등을 넣지 마세요.</b> 시(時)가 바뀌면 시주(時柱)가 달라져
           오행·용신·개운법까지 전부 틀어집니다.<br>
           리포트 제작 전에 고객에게 <b>태어난 시각을 먼저 확인</b>하세요.
         </p>
       </div>`
    : '';

  const concernsHtml = (concerns && concerns.length)
    ? `<h3 style="margin-top:24px;">궁금한 점 3가지</h3>
       <ol style="padding-left:20px;line-height:1.8;">
         ${concerns.map(c => `<li><b>${c.label}</b><br>${c.answer}</li>`).join('')}
       </ol>`
    : '';

  const subChoiceHtml = subChoice
    ? `<h3 style="margin-top:24px;">세부 선택</h3>
       <p>선택 항목: ${subChoice.selected || '-'}</p>
       ${subChoice.extra ? `<p>추가 입력: ${subChoice.extra}</p>` : ''}`
    : '';

  const html = `
    <div style="font-family:'Apple SD Gothic Neo',sans-serif;max-width:640px;margin:0 auto;padding:24px;">
      <h2 style="border-bottom:2px solid #6C63C7;padding-bottom:8px;">🔔 신규 주문 접수</h2>
      ${timeWarningHtml}
      ${referrerHtml}
      <p><b>접수 시간:</b> ${now}</p>
      <p><b>유입 경로:</b> ${source || 'direct'}</p>

      <h3 style="margin-top:24px;">주문 정보</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#666;width:120px;">상품</td><td><b>${productTitle}</b></td></tr>
        <tr><td style="padding:6px 0;color:#666;">결제 금액</td><td><b>${price || ''}</b></td></tr>
        <tr><td style="padding:6px 0;color:#666;">고객 이름</td><td>${name || '-'}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">이메일</td><td>${email}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">휴대폰</td><td>${phone || '-'}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">추천인</td><td>${referrer || '-'}</td></tr>
      </table>

      ${birthJson ? `
        <h3 style="margin-top:24px;">본인 사주 정보 (PDF 생성용 JSON)</h3>
        <pre style="background:#f0f0f0;padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-all;font-size:12px;">${birthJson}</pre>
      ` : ''}

      ${partnerJson ? `
        <h3 style="margin-top:24px;">상대방/자녀 정보</h3>
        <pre style="background:#f0f0f0;padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-all;font-size:12px;">${partnerJson}</pre>
      ` : ''}

      ${subChoiceHtml}
      ${concernsHtml}

      <hr style="margin:28px 0;">
      <p style="color:#888;font-size:12px;">입금 확인 후 위 JSON으로 PDF를 만들고, send-report로 첨부 발송하세요.</p>
    </div>
  `;

  const { data, error } = await resend.emails.send({
    from: '달빛사주 알림 <onboarding@resend.dev>',
    to: [process.env.ADMIN_EMAIL],
    subject: `${timeWarning ? '[생시확인필요] ' : ''}${(referrer && referrer.trim()) ? '[추천] ' : ''}🔔 신규 주문 - ${productTitle} (${name || '이름없음'})`,
    html,
  });
  if (error) throw new Error(error.message || '관리자 이메일 발송 실패');
  return data;
}

// ─────────────────────────────────────────────
// 메인 핸들러
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  }

  try {
    const { email, phone, name, productTitle, price,
            birth, partner, subChoice, concerns, source, referrer } = req.body;

    if (!email || !productTitle) {
      return res.status(400).json({ error: '이메일과 리포트 종류는 필수입니다.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '이메일 형식이 올바르지 않습니다.' });
    }

    const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const results = { customer: null, admin: null, sms: null };

    // ═══════════════════════════════════════════
    // 세 채널을 병렬로, 그리고 서로 독립적으로 실행
    // ═══════════════════════════════════════════
    const tasks = [
      // 1) 고객 이메일
      sendCustomerEmail({ email, name, productTitle, price, now })
        .then(d => { results.customer = { ok: true, id: d?.id }; })
        .catch(e => {
          results.customer = { ok: false, error: e.message };
          console.error('❌ 고객 이메일 실패:', e.message);
        }),

      // 2) 관리자 이메일
      sendAdminEmail({ email, phone, name, productTitle, price,
                       birth, partner, subChoice, concerns, source, referrer, now })
        .then(d => { results.admin = { ok: true, id: d?.id }; })
        .catch(e => {
          results.admin = { ok: false, error: e.message };
          console.error('❌ 관리자 이메일 실패:', e.message);
        }),

      // 3) SMS (전화번호가 유효할 때만)
      (phone && /^01[0-9]{8,9}$/.test(phone)
        ? sendLMS({ to: phone, name, productTitle, price })
            .then(() => { results.sms = { ok: true }; })
            .catch(e => {
              results.sms = { ok: false, error: e.message };
              console.error('❌ SMS 실패:', e.message);
            })
        : Promise.resolve().then(() => { results.sms = { ok: false, error: '전화번호 없음/형식오류' }; })
      ),
    ];

    await Promise.all(tasks);

    // 성공 판단 기준: 고객 이메일이 성공했으면 success:true
    // (프론트엔드 UX 안 건드리기 위해)
    const success = !!results.customer?.ok;

    return res.status(200).json({
      success,
      results,
      // 프론트가 error로 표시할 메시지 (customer 실패 시)
      error: success ? undefined : (results.customer?.error || '메일 발송에 실패했습니다.'),
    });
  } catch (e) {
    console.error('Server error:', e);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}
