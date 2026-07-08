// /api/send-confirmation.js
// Vercel 서버리스 함수 — 접수완료 메일(고객) + 신규 주문 알림(관리자, PDF 생성용 JSON 포함) 발송
// 필요 환경변수:
//   RESEND_API_KEY  — Resend API 키
//   ADMIN_EMAIL     — 주문 알림을 받을 본인 이메일 (예: pungsufairy@gmail.com)

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function buildBirthJson(birth) {
  if (!birth || !birth.year || !birth.month || !birth.day) return null;
  return JSON.stringify({
    year: birth.year, month: birth.month, day: birth.day,
    hour: birth.timeUnknown ? 12 : (birth.hour ?? 12),
    minute: birth.timeUnknown ? 0 : (birth.minute ?? 0),
    gender: birth.gender || 'M',
    isLunar: !!birth.isLunar,
    name: birth.name || '',
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  }

  try {
    const { email, name, productTitle, price, birth, partner, subChoice, concerns, source } = req.body;

    if (!email || !productTitle) {
      return res.status(400).json({ error: '이메일과 리포트 종류는 필수입니다.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '이메일 형식이 올바르지 않습니다.' });
    }

    const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

    // 1) 고객용 접수완료 메일
    const { error: custError } = await resend.emails.send({
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
            <p><b>결 ${productTitle}</b> 접수가 완료되었습니다.</p>
            <p>결제 확인 후 사주풀이가 시작됩니다.<br><b>24시간 내 이 이메일로 전달드립니다.</b></p>
            <div style="background:#f5f5f9;padding:14px 18px;border-radius:8px;margin:18px 0;font-size:13.5px;line-height:1.8;">
              접수 시간: ${now}<br>
              리포트 종류: ${productTitle}<br>
              결제 금액: ${price || ''}
            </div>
            <p style="text-align:center;color:#888;font-size:13px;margin-top:24px;">감사합니다.<br>- 달빛사주 드림</p>
          </div>
        </div>
      `,
    });
    if (custError) console.error('고객 메일 발송 실패:', custError);

    // 2) 관리자 알림 메일 (PDF 생성용 JSON 포함) — ADMIN_EMAIL 설정된 경우만
    if (process.env.ADMIN_EMAIL) {
      const birthJson = buildBirthJson(birth);
      const partnerJson = partner && partner.year ? buildBirthJson(partner) : null;

      const SOURCE_LABEL = { youtube:'유튜브 🔴', instagram:'인스타그램 💗', tiktok:'틱톡 🖤', direct:'직접 방문(출처 불명)' };
      const sourceText = SOURCE_LABEL[source] || source || '알 수 없음';

      const html = `
        <div style="font-family:monospace;max-width:600px;margin:0 auto;padding:20px;">
          <h2>신규 주문 접수</h2>
          <p><b>유입 채널:</b> <span style="background:#eef;padding:2px 8px;border-radius:6px;">${sourceText}</span></p>
          <p><b>상품:</b> ${productTitle} (${price || ''})</p>
          <p><b>고객 이메일:</b> ${email}</p>
          <p><b>접수 시간:</b> ${now}</p>

          ${birthJson ? `
          <h3>본인 정보</h3>
          <p>이름: ${birth.name || '-'} / 성별: ${birth.gender === 'M' ? '남' : birth.gender === 'F' ? '여' : '-'} /
             생년월일: ${birth.year}-${birth.month}-${birth.day} ${birth.timeUnknown ? '(시간 모름)' : `${birth.hour ?? '?'}:${String(birth.minute ?? 0).padStart(2,'0')}`} (${birth.isLunar ? '음력' : '양력'})</p>
          <p><b>PDF 생성용 JSON (그대로 복사해서 사용)</b></p>
          <pre style="background:#f0f0f0;padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-all;">${birthJson}</pre>
          <p style="color:#666;">터미널 명령어:<br>
          <code>node generate.mjs '${birthJson}' report.pdf</code></p>
          ` : '<p style="color:#c00;">주의: 생년월일 정보가 비어 있습니다 — 폼 입력을 확인하세요.</p>'}

          ${partnerJson ? `
          <h3>상대방/자녀 정보</h3>
          <pre style="background:#f0f0f0;padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-all;">${partnerJson}</pre>
          <p style="color:#666;">궁합류 리포트 발송 명령어 (본인 JSON, 상대방 JSON 순서):<br>
          <code>node send-report.mjs '${birthJson}' ${email} "${productTitle}" '${partnerJson}'</code></p>
          ` : ''}

          ${subChoice ? `
          <h3>세부 선택</h3>
          <p>선택 항목: ${subChoice.selected || '-'}</p>
          ${subChoice.extra ? `<p>추가 입력: ${subChoice.extra}</p>` : ''}
          ` : ''}

          ${concerns && concerns.length ? `
          <h3>고객이 남긴 궁금한 점</h3>
          ${concerns.map((c, i) => `<p><b>${i+1}. ${c.label}</b><br>${c.answer}</p>`).join('')}
          ` : ''}

          <hr>
          <p style="color:#888;font-size:12px;">입금 확인 후 위 명령어로 PDF를 만들고,
          send-report.mjs로 첨부 발송하세요. (README-report.md 참고)</p>
        </div>
      `;

      const { error: adminError } = await resend.emails.send({
        from: '달빛사주 알림 <onboarding@resend.dev>',
        to: [process.env.ADMIN_EMAIL],
        subject: `신규 주문 - ${productTitle} (${birth?.name || '이름없음'})`,
        html,
      });
      if (adminError) console.error('관리자 알림 발송 실패:', adminError);
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('Server error:', e);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}
