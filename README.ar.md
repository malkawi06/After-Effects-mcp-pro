<div dir="rtl">

# After Effects MCP Pro

[![الإصدار](https://img.shields.io/badge/version-1.6.0-FF5A1F)](CHANGELOG.md) [![الترخيص: MIT](https://img.shields.io/badge/license-MIT-1F2937)](LICENSE) [![MCP](https://img.shields.io/badge/MCP-server-8D1E2D)](https://modelcontextprotocol.io) [![Tests](https://img.shields.io/badge/tests-78%20passing-007A3D)](server/test)

**بيخلّي Claude يشتغل جوّا After Effects كأنه مصمم موشن خبير: بيبني، وبيشوف شو عمل، وبينتقد شغله، وبيعمل render، وكل هاد بأقل عدد توكنز ممكن.**

![Hello wink](docs/hello-wink.gif)

## الفيديو التعريفي

<video src="docs/promo-preview.mp4" autoplay muted loop playsinline width="100%" aria-label="معاينة الفيديو التعريفي"></video>

*معاينة من الفيديو الكامل (56 ثانية، 1080p، 60 فريم)، انعمل من برومت واحد بهالأداة.*

## ليش بدك تجربها؟

- **جملة وحدة بتصير فيديو كامل:** Claude بيبني الطبقات والكيفريمات والكاميرا والانتقالات جوّا After Effects، وبتحصل على مشروع حقيقي بتقدر تفتحه وتعدّل عليه.
- **الموسيقى أولًا:** بيقرأ الضربة، ويحدد الـ drops والـ breaks، ويحط القصّات على الضربة مع مؤثر صوتي عند كل ضربة.
- **بيراجع شغله بنفسه:** بيفحص الفريمات والتوقيت والصوت قبل الـ render، ولما يلقى مشكلة بيقولك شو تصلح.
- **جاهزة للعربي:** كتابة من اليمين لليسار، وخطوط Google بتشتغل فورًا.
- **آمنة افتراضيًا:** الكود الخام مطفي لحد ما تفعّله، والملفات بتنكتب بمجلد واحد، وكل استدعاء بيتسجّل بدون محتواه.

> فيديو تعريفي قصير رح ينحط هون لما ينشر. لحد هيك، الـ clip `hello-wink` فوق هو المرجع.

## شو الفرق عن غيره؟

- **مش أوامر محدودة:** Claude بيقدر يعمل أي إشي إله scripting بـ After Effects، عن طريق ExtendScript ومكتبة حركة جاهزة اسمها AEH.
- **بيشوف شغله:** أداة `ae_review` بترجعله فريمات المقطع، وتحتها شريط فيه الحركة والـ keyframes وموجة الصوت، ومعها فحوصات تلقائية: الحواف، والفريمات الفاضية، والـ easing، والـ motion blur، وتزامن الصوت.
- **تزامن حقيقي مع الموسيقى:** بيحلّل الأغنية (الـ kick والـ snare، والأقسام الهادية والقوية، والـ drop والـ break)، وبيحط markers، وبيفحص إذا كل قصّة واقعة على ضربة. ومكتبة مؤثرات صوتية (SFX) بتحفظ لحظة الضربة بكل صوت وبتنزّلها بالضبط على الفريم اللي بدك ياه.
- **خطوط ولقطات شاشة:** بيثبّت خطوط Google المجانية، وبيعرض 3 خيارات تختار منها، والخط بيشتغل فورًا بدون تسجيل خروج، وبيصوّر نافذة After Effects نفسها.
- **بيفهم الـ reference:** بتعطيه فيديو أو صورة، وهو بيحلّلهم وبيعمل زيهم أو بيطوّر عليهم.
- **Render بالخلفية:** باستخدام `aerender`، فـ After Effects ما بيعلق.
- **صوت:** بيولّد voice-over بأصوات النظام.
- **ذاكرة اختيارية:** بيحفظ ستايلك أو دروس أو recipes بس لما تطلب منه.
- **أمان:** بيتصل بس من نفس الجهاز (127.0.0.1) بمفتاح سري، وكل أمر بيتسجّل بالـ panel، وفي زر بيوقف تنفيذ الكود الحر.

## التوكنز

| الشي | قبل | بعد |
|---|---:|---:|
| تعريفات الأدوات (بتنبعت مع كل رسالة) | 1,625 (10 أدوات) | **1,792 (14 أداة)** |
| فحص comp فيه 10 layers | 1,430 | **518** |
| كود مقطع الـ Hello (ExtendScript عادي مقابل AEH) | 4,001 | **1,362** |
| مراجعة بصرية بـ 12 فريم | 1,533 | **1,202** |

## التثبيت

> 📘 الدليل الكامل خطوة بخطوة، مع طريقة الاستخدام وحل المشاكل، موجود بـ [docs/SETUP.md](docs/SETUP.md)

1. شغّل `install\install-windows.ps1`.
2. من After Effects روح على Preferences ← Scripting & Expressions وفعّل **Allow Scripts to Write Files and Access Network**، وبعدين اعمل restart للبرنامج.
3. نزّل [`after-effects-mcp-pro.mcpb`](https://github.com/malkawi06/After-Effects-mcp-pro/raw/main/install/after-effects-mcp-pro.mcpb) من مجلد `install` وثبّته بـ Claude Desktop (Settings ← Extensions).
4. اختياري: ضيف `skill/SKILL.md` كـ skill.

## التشغيل كل مرة

1. افتح After Effects، والـ bridge بيشتغل لحاله بالخلفية.
2. إذا بدك تشوفه: Window ← Extensions ← **Claude Bridge**. إذا النقطة خضرا، يعني جاهز.
3. بـ Claude اكتب: "Check the After Effects connection"، وبعدها اطلب أي إشي بالكلام العادي.

إذا النقطة حمرا، أو ما ظهر بالقائمة، أو Claude ما وصل للـ panel، شوف قسم Troubleshooting بـ [docs/SETUP.md](docs/SETUP.md).

## المطوّر

**محمد ملكاوي** · [@malkawi06](https://github.com/malkawi06)

طالب شبكات وأمن سيبراني من الأردن، بيشتغل على مشاريع بتجمع بين الذكاء الاصطناعي والتصميم والهاردوير. محمد صاحب فكرة After Effects MCP Pro: هو اللي حدّد المتطلبات (جودة احترافية، مراجعة بصرية ذاتية، ذاكرة اختيارية، أقل استهلاك توكنز)، وهو اللي اختبرها على After Effects حقيقي. الكود انكتب بالتعاون مع Claude من Anthropic.

التفاصيل الكاملة موجودة بـ [README.md](README.md).

</div>
