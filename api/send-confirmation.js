// /api/send-confirmation.js
// Vercel 서버리스 함수 — Resend로 이메일 발송 + Solapi로 LMS(장문 문자) 발송
// 필요 환경변수:
//   RESEND_API_KEY       (Resend API 키)
//   SOLAPI_API_KEY       (솔라피 API 키)
//   SOLAPI_API_SECRET    (솔라피 API 시크릿)
//   SOLAPI_SENDER        (솔라피에 사전등록한 발신번호, 예: '01012345678')

import { Resend } from 'resend';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);

// ─────────────────────────────────────────────
// Solapi HMAC-SHA256 인증 헤더 생성
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
// LMS(장문 문자) 발송
// ─────────────────────────────────────────────
async function sendLMS({ to, name, productTitle, price }) {
  const from = process.env.SOLAPI_SENDER;
  if (!from) throw new Error('SOLAPI_SENDER 환경변수가 설정되지 않았습니다.');

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
      message: {
        to,
        from,
        text,
        subject: '[달빛사주] 접수 완료',
        type: 'LMS',
      },
    }),
  });

  const json = await res.json();
  if (!res.ok || json.statusCode !== '2000') {
    throw new Error(json.statusMessage || 'LMS 발송 실패');
  }
  return json;
}

// ─────────────────────────────────────────────
// 메인 핸들러
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  }

  try {
    const { email, phone, name, productTitle, price } = req.body;

    if (!email || !productTitle) {
      return res.status(400).json({ error: '이메일과 리포트 종류는 필수입니다.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '이메일 형식이 올바르지 않습니다.' });
    }

    const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

    // ── 1) 이메일 발송 (Resend) ────────────────
    const { data: emailData, error: emailError } = await resend.emails.send({
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

    if (emailError) {
      console.error('Resend error:', emailError);
      return res.status(400).json({ error: emailError.message || '메일 발송에 실패했습니다.' });
    }

    // ── 2) LMS 발송 (Solapi) — 실패해도 전체 요청은 성공으로 처리 ────
    let smsOk = false, smsError = null;
    if (phone && /^01[0-9]{8,9}$/.test(phone)) {
      try {
        await sendLMS({ to: phone, name, productTitle, price });
        smsOk = true;
      } catch (e) {
        smsError = e.message;
        console.error('Solapi LMS error:', e);
        // 문자 실패는 로그만 남기고 사용자에게는 성공으로 응답 (이메일은 이미 나감)
      }
    }

    return res.status(200).json({
      success: true,
      id: emailData.id,
      smsOk,
      smsError,
    });
  } catch (e) {
    console.error('Server error:', e);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}
