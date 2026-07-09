// /api/send-confirmation.js
// Vercel 서버리스 함수 — 실제로 Resend를 통해 접수완료 메일을 발송합니다.
// 필요 환경변수: RESEND_API_KEY (Vercel 프로젝트 설정 > Environment Variables에 등록)

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  }

  try {
    const { email, name, productTitle, price } = req.body;

    if (!email || !productTitle) {
      return res.status(400).json({ error: '이메일과 리포트 종류는 필수입니다.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '이메일 형식이 올바르지 않습니다.' });
    }

    const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

    const { data, error } = await resend.emails.send({
      // ⚠️ 도메인 인증 전까지는 이 발신 주소(onboarding@resend.dev)만 사용 가능합니다.
      // Resend 대시보드에서 본인 도메인을 인증하면 아래를 '달빛사주 <no-reply@본인도메인.com>' 으로 바꾸세요.
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

    if (error) {
      console.error('Resend error:', error);
      return res.status(400).json({ error: error.message || '메일 발송에 실패했습니다.' });
    }

    return res.status(200).json({ success: true, id: data.id });
  } catch (e) {
    console.error('Server error:', e);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}
