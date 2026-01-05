const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const dialogueBox = document.getElementById('dialogue-box');
const dialogueText = document.getElementById('dialogue-text');

// Dialogue helpers (v5 had a missing function reference that prevented any dialogue from rendering)
function showDialogue() {
    if (dialogueBox) dialogueBox.classList.remove('hidden');
}

function hideDialogue() {
    if (dialogueBox) dialogueBox.classList.add('hidden');
}
// STATUS BARS (replace heart-based HP display)
const barFatigueFill = document.getElementById('bar-fatigue');
const barTimeFill = document.getElementById('bar-time');
const barPsycheFill = document.getElementById('bar-psyche');
const barFatigueVal = document.getElementById('val-fatigue');
const barTimeVal = document.getElementById('val-time');
const barPsycheVal = document.getElementById('val-psyche');

// Game State
const keys = {};
let player = {
    x: 288,
    y: 270,
    width: 64,
    height: 64,
    speed: 2, // Slower for ambient movement
    direction: 'down', // 'up', 'down', 'left', 'right'
    // Auto-movement properties
    targetX: 288,
    targetY: 270,
    state: 'idle', // 'idle' | 'moving'
    waitTimer: 60 // Wait frames
};

// Shake Effect
let shakeTimer = 0;
let shakeIntensity = 0;

// Progress / Status System
let maxHP = 5;
let currentHP = 5;
let lastSafeNodeId = 'step0_intro';

// For the UI bars:
// - 疲労: increases as mistakes accumulate (derived from HP loss)
// - 時間: decreases as unique steps progress
// - 心理: decreases as mistakes accumulate (derived from HP)
const visitedSteps = new Set();
let totalStepCount = 1; // will be recalculated after dialogueTree is available

// 新しいステータス変数（0〜100の範囲）
let statusFatigue = 0;   // 疲労: 0から始まり増加（悪化）
let statusPsyche = 100;  // 心理: 100から始まり減少（悪化）
let statusTime = 100;    // 時間: 100から始まり減少（消費）

// 選択肢の効果を適用する関数
function applyChoiceEffects(effects) {
    if (!effects) return;
    statusFatigue = clamp(statusFatigue + (effects.fatigue || 0), 0, 100);
    statusPsyche = clamp(statusPsyche + (effects.psyche || 0), 0, 100);
    statusTime = clamp(statusTime + (effects.time || 0), 0, 100);
    updateStatusUI();
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function setBar(fillEl, pct) {
    if (!fillEl) return;
    const v = clamp(pct, 0, 100);
    fillEl.style.width = `${v}%`;
}

function updateStatusUI() {
    // 直接ステータス変数を使用
    setBar(barFatigueFill, statusFatigue);
    setBar(barPsycheFill, statusPsyche);
    setBar(barTimeFill, statusTime);

    if (barFatigueVal) barFatigueVal.textContent = `${Math.round(statusFatigue)}%`;
    if (barTimeVal) barTimeVal.textContent = `${Math.round(statusTime)}%`;
    if (barPsycheVal) barPsycheVal.textContent = `${Math.round(statusPsyche)}%`;
}

function resetStatusTracking() {
    visitedSteps.clear();
    // Count total unique steps in dialogueTree that start with 'step'
    // This gives us a denominator for the progress bar
    if (typeof dialogueTree !== 'undefined') {
        const steps = Object.keys(dialogueTree).filter(k => k.startsWith('step'));
        totalStepCount = steps.length;
    } else {
        totalStepCount = 80; // Fallback estimate
    }
}

function registerStepForProgress(nodeId) {
    if (!nodeId) return;
    // Only track main progression steps
    if (nodeId.startsWith('step')) {
        visitedSteps.add(nodeId);
    }
}

// Simple collision box for the desk in the center of the 640x480 bg
const desk = {
    x: 260,
    y: 200,
    width: 120,
    height: 100
};

const receptionist = {
    x: 300,
    y: 158,
    width: 64,
    height: 64
};

// Assets
const images = {
    player: new Image(),
    receptionist: new Image(),
    bg: new Image()
};

let assetsLoaded = 0;
const totalAssets = 3;

function onAssetLoad() {
    assetsLoaded++;
    if (assetsLoaded === totalAssets) {
        startGame();
    }
}

function onAssetError(e) {
    console.error("Failed to load asset:", e.target.src);
    // Proceed anyway for testing if needed, or fallback
    assetsLoaded++;
    if (assetsLoaded === totalAssets) {
        startGame();
    }
}

images.player.src = 'assets/player.png';
images.player.onload = onAssetLoad;
images.player.onerror = onAssetError;

images.receptionist.src = 'assets/receptionist.png';
images.receptionist.onload = onAssetLoad;
images.receptionist.onerror = onAssetError;

images.bg.src = 'assets/office_bg.png';
images.bg.onload = onAssetLoad;
images.bg.onerror = onAssetError;

// Fallback safety
setTimeout(() => {
    if (assetsLoaded < totalAssets) {
        console.warn("Asset loading timed out. Force starting.");
        startGame();
    }
}, 3000);

// Dialogue Data (Same as before but fail nodes are standard)
const dialogueTree = {

    // ==========================================
    // PHASE 0–1 : INTRO / ENTRY（体験寄り・消耗型）
    // ==========================================

    'step0_intro': {
        text: "（喉がカラカラだ。ここまで来るだけで、体力より先に気持ちが削れる。）\nあなたは冒険者です。\n生活できなくなり、福祉ギルドに来ました。\n番号を呼ばれるまで、しばらく待たされました。",
        choices: [],
        next: 'start'
    },

    'start': {
        text: "【相談員】 次の方。\nご用件を。",
        choices: [
            { text: "生活保護の申請に来ました。", next: 'step2_card', effects: { fatigue: 1, psyche: 0, time: -1 } },
            { text: "遊びに来ました。", next: 'fail_play' },
            { text: "特に用はありません。", next: 'fail_loiter' }
        ]
    },

    // ==========================================
    // ID確認
    // ==========================================

    'step2_card': {
        text: "【相談員】 生活保護申請ですね。\n身分証を提示してください。",
        choices: [
            { text: "はい。（冒険者ギルドカードを出す）", next: 'step3_citizenship', effects: { fatigue: 1, psyche: 0, time: -1 } },
            { text: "なくしました。", next: 'fail_id_lost' },
            { text: "なぜ必要なんですか？", next: 'fail_compliance' }
        ]
    },

    'step3_citizenship': {
        text: "【相談員】 確認しました。\nこの国の国民ですか？",
        choices: [
            { text: "ギルドカードに記載されています。確認してください。", next: 'step4_job', effects: { fatigue: 1, psyche: 0, time: -1 } },
            { text: "人道上の保護対象です。", next: 'step4_job', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "心はこの国のものです。", next: 'fail_doc_required' }
        ]
    },

    // ==========================================
    // 職業確認
    // ==========================================

    'step4_job': {
        text: "【相談員】 現在、仕事はしていますか？",
        choices: [
            { text: "していません。", next: 'step5_previous_job', effects: { fatigue: 1, psyche: -1, time: -1 } },
            { text: "冒険者として活動しています。", next: 'fail_job' },
            { text: "覚えていません。", next: 'fail_memory' }
        ]
    },

    'step5_previous_job': {
        text: "【相談員】 以前は、冒険者一本ですか？",
        choices: [
            { text: "はい。冒険者一本でした。", next: 'step6_reason_for_resignation', effects: { fatigue: 1, psyche: 0, time: -1 } },
            { text: "兼業していました。", next: 'fail_farmer' },
            { text: "思い出せません。", next: 'fail_memory' }
        ]
    },

    // ==========================================
    // 退職理由
    // ==========================================

    'step6_reason_for_resignation': {
        text: "【相談員】 では。\nなぜ冒険者を辞めたのですか。",
        choices: [
            { text: "魔物との戦闘で後遺症が残りました。", next: 'step7_illness', effects: { fatigue: 2, psyche: -2, time: -1 } },
            { text: "やる気がなくなりました。", next: 'fail_lazy' },
            { text: "特に理由はありません。", next: 'fail_lazy' }
        ]
    },

    // ==========================================
    // ※ 以下3つは「変更しない」と指定された相談員セリフ
    //    → 文面完全保持
    // ==========================================

    'step7_illness': {
        text: "【相談員】 病気ですか。\n病気でも、生活保護に依存しないで働いている方は多くいますよ。\n自立して一人前になれるよう、努力しましょう。",
        choices: [
            {
                text: "自立とは依存しないことではありません。依存先を増やして分散させることです。現在の私には、公的扶助という依存先が必要です。",
                next: 'step10_evidence',
                effects: { fatigue: 5, psyche: -3, time: -2 }
            },
            { text: "わかりました。", next: 'fail_easy_giveup' },
            { text: "……", next: 'fail_emotional' }
        ]
    },

    'step8_employed': {
        text: "【相談員】 お仕事されているのですね。\n生活保護は就労が困難な方が対象です。\nまだお若いようですし、生活保護に頼らず、自立するようがんばりましょう。",
        choices: [
            {
                text: "収入が最低生活費を下回っていれば受給対象になります。",
                next: 'step9_self-sufficient',
                effects: { fatigue: 4, psyche: -2, time: -2 }
            }
        ]
    },

    'step9_self-sufficient': {
        text: "【相談員】 自立しないと一人前になれませんよ？\n生活保護に依存しないで、ひとりで生きられるように努力してくださいね。",
        choices: [
            {
                text: "自立とは依存しないことではありません。依存先を増やして分散させることです。現在の私には公的扶助が必要です。",
                next: 'step10_evidence',
                effects: { fatigue: 5, psyche: -3, time: -2 }
            }
        ]
    },

    // ==========================================
    // PHASE 2–7 : EVIDENCE / SAVINGS / ADDRESS / FAMILY / INVENTORY / DETERRENCE
    // （体験寄り・消耗型）
    // ==========================================

    'step10_evidence': {
        text: "【相談員】 では。\n病気の状態を証明する『医師の診断書』が必要です。\nありますか？",
        choices: [
            { text: "はい、取得してあります。（提出する）", next: 'step11_doctor', effects: { fatigue: 2, psyche: 0, time: -1 } },
            { text: "これから病院に行きます。", next: 'fail_prepare_first' },
            { text: "見ればわかるでしょう！", next: 'fail_doc_required' }
        ]
    },

    // ==========================================
    // Illness evidence check
    // ==========================================

    'step11_doctor': {
        text: "【相談員】 （診断書を見て）……ふむ。\nこの病院は？",
        choices: [
            { text: "町外れの診療所ですが、正規の医師です。", next: 'step12_savings', effects: { fatigue: 2, psyche: 0, time: -1 } },
            { text: "闇医者です。", next: 'fail_illegal_doc' },
            { text: "実は私が書きました。", next: 'fail_fraud' }
        ]
    },

    'step12_savings': {
        text: "（説明する前に、もう“怒られる前提”で言葉を選んでいる自分に気づく。）\n【相談員】 そうですか。\nでは、貯金は？ 口座を見せてください。",
        choices: [
            { text: "治療費ですべて使い果たしました。", next: 'step13_party', effects: { fatigue: 3, psyche: -2, time: -1 } },
            { text: "タンス預金が少しあります。", next: 'fail_use_savings' },
            { text: "見せたくありません。", next: 'fail_investigation_refusal' }
        ]
    },

    'step13_party': {
        text: "【相談員】 はぁ。\nパーティは？ 仲間に助けてもらうことは？",
        choices: [
            { text: "病気を理由に解散・追放されました。", next: 'step14_severance', effects: { fatigue: 3, psyche: -3, time: -1 } },
            { text: "ソロプレイヤー（ぼっち）でした。", next: 'fail_solo' },
            { text: "連絡したくありません。", next: 'fail_investigation_refusal' }
        ]
    },

    'step14_severance': {
        text: "【相談員】 解散時の『手切れ金』や『分配金』は？\nそれで生活できますよね。",
        choices: [
            { text: "生活費と治療代で消えました。", next: 'step15_address', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "まだ持っています。", next: 'fail_use_savings' },
            { text: "騙されて一銭も貰えませんでした。", next: 'fail_police' }
        ]
    },

    // ==========================================
    // Address / Oral application
    // ==========================================

    'step15_address': {
        text: "【相談員】 住所は？\n住所不定だと手続きは難しいですよ。",
        choices: [
            { text: "今は公園で野宿しています。", next: 'step16_oral', effects: { fatigue: 2, psyche: -2, time: -1 } },
            { text: "ネットカフェです。", next: 'step16_oral', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "友達の家を転々としています。", next: 'fail_address' }
        ]
    },

    'step16_oral': {
        text: "（この一言で終わる。そう思うだけで、手のひらが冷たくなる。）\n【相談員】 住所がないと書類が送れません。\n住居を確保してから出直してください。",
        choices: [
            { text: "住居がなくても『口頭申請』は可能です。受け付けてください。", next: 'step17_right_to_apply', effects: { fatigue: 5, psyche: -2, time: -2 } },
            { text: "わかりました、探してきます。", next: 'fail_search' },
            { text: "そこをなんとかなりませんか？", next: 'fail_bribe' }
        ]
    },

    'step17_right_to_apply': {
        text: "【相談員】 いずれにせよ、生活保護は定員に達しているので受け付けられません。\n交通費として500ゴールドあげますから、よその町のギルドへ行ってください。",
        choices: [
            { text: "それは申請権の侵害ですし、法律違反だし、差別ですよ？", next: 'step18_shelter', effects: { fatigue: 6, psyche: -3, time: -2 } },
            { text: "定員オーバーなら仕方ないですね。", next: 'fail_easy_giveup' },
            { text: "どこの町のギルドに行けばいいんですか？", next: 'fail_moon' }
        ]
    },

    'step18_shelter': {
        text: "【相談員】 ……わかりました。\n……正直、私の裁量じゃどうにもならないことも多いんですよ。\n無料低額宿泊所を案内します。入ってください。",
        choices: [
            { text: "施設は満員で入れません。また、劣悪な環境は拒否します。", next: 'step19_family', effects: { fatigue: 5, psyche: -2, time: -2 } },
            { text: "ありがとうございます。行きます。", next: 'fail_shelter_trap' },
            { text: "相部屋は嫌です。", next: 'fail_selfish' }
        ]
    },

    // ==========================================
    // Family
    // ==========================================

    'step19_family': {
        text: "【相談員】 家族は？\n援助してもらえば？",
        choices: [
            { text: "援助は受けられません。", next: 'step20_family_relationships', effects: { fatigue: 3, psyche: -3, time: -1 } },
            { text: "連絡したくありません。", next: 'fail_investigation_refusal' },
            { text: "実家は遠方なので……", next: 'fail_go_home' }
        ]
    },

    'step20_family_relationships': {
        text: "【相談員】 生活保護は、生きるか死ぬかの瀬戸際で使う最後の手段です。\n王国の議員もそう言っています。\n努力が足りないのではないでしょうか？",
        choices: [
            { text: "その議員の見解は単なる個人の思い込みで、何の根拠もありません。実際にはそのような決まりは存在しません。", next: 'step21_contact', effects: { fatigue: 5, psyche: -2, time: -2 } },
            { text: "確かにその通りかもしれません……", next: 'fail_easy_giveup' },
            { text: "死ぬしかないのですか？", next: 'fail_emotional' }
        ]
    },

    'step21_contact': {
        text: "【相談員】 親族には扶養義務があります。\nこちらから確認します。連絡先は？",
        choices: [
            { text: "ギルドの運用指針等により、著しい関係悪化が懸念される場合の照会は控えるべきです。", next: 'step22_lie', effects: { fatigue: 6, psyche: -3, time: -2 } },
            { text: "やめてください！", next: 'fail_emotional' },
            { text: "連絡先は忘れました。", next: 'fail_investigation_refusal' }
        ]
    },

    'step22_lie': {
        text: "【相談員】 ……こういうやり方、好きじゃないんですけどね。\n電話を掛けてみればわかりますよ。\n（電話をかけるフリをして）\nあ、もしもし？ お母様ですか？ ……はい、はい。\n……あ、息子さんの援助ができる？ 送金する？ なるほど、わかりました～！\nご実家が援助してくれるそうです。よかったですね！ 申請は不要です！",
        choices: [
            { text: "ウソです。扶養義務の強制はできません。申請を受け付けてください。", next: 'step23_clothes', effects: { fatigue: 6, psyche: -4, time: -2 } },
            { text: "えっ、本当に！？ 母さんありがとう！", next: 'fail_trap_signed' },
            { text: "受話器、つながってませんよね？", next: 'fail_lie' }
        ]
    },

    // ==========================================
    // Inventory / dignity erosion
    // ==========================================

    'step23_clothes': {
        text: "【相談員】 では資産。\nそのコート。売れますよね。",
        choices: [
            { text: "これは生活に必要な衣服（必需品）です。売却義務はありません。", next: 'step24_equip', effects: { fatigue: 3, psyche: -2, time: -1 } },
            { text: "安物ですよ。", next: 'fail_prove_cheap' },
            { text: "裸で歩けと言うんですか？", next: 'fail_sell_clothes' }
        ]
    },

    'step24_equip': {
        text: "【相談員】 じゃあ武器。\n売って食費にしなさい。",
        choices: [
            { text: "壊れて錆びています。資産価値はありません。", next: 'step25_unable_to_work', effects: { fatigue: 3, psyche: -1, time: -1 } },
            { text: "冒険者の魂です！", next: 'fail_keepsake' },
            { text: "わかりました売ります。", next: 'fail_sell_weapon' }
        ]
    },

    // ==========================================
    // step25 series — ★変更禁止（指定済み）
    // ==========================================

    'step25_unable_to_work': {
        text: "【相談員】 はぁ……\n五体満足で、口も達者で、なんで働かないんですか？\n税金泥棒だと思いませんか？",
        choices: [
            { text: "働かないのではなく、働けないのです。決めつけないでください。", next: 'step26_people_in_need', effects: { fatigue: 5, psyche: -4, time: -2 } },
            { text: "すみません……", next: 'fail_withdraw_fear' },
            { text: "余計なお世話です。", next: 'fail_rude' }
        ]
    },

    'step26_people_in_need': {
        text: "【相談員】 生活保護は、本当に困っている人のためにあるんですよ。\nあなたは、本当は困っていないんじゃないんですか？\n甘えないでください。",
        choices: [
            { text: "それはあなたの空想上の『理想的な貧困者』です。現実の人間を、架空の基準で裁かないでください。", next: 'step27_welfare_is_shameful', effects: { fatigue: 6, psyche: -4, time: -2 } },
            { text: "言われてみれば、努力不足でした。", next: 'fail_easy_giveup' },
            { text: "自分でも自分が惨めです。", next: 'fail_emotional' }
        ]
    },

    'step27_welfare_is_shameful': {
        text: "【相談員】 生活保護は恥だと王国の議員も言ってますよ？\nみんなの恩恵で生きて恥ずかしくないんですか？",
        choices: [
            { text: "健康で文化的な最低限度の生活を営む権利――生存権があります。", next: 'step28_article_25', effects: { fatigue: 5, psyche: -3, time: -2 } },
            { text: "福祉は恩恵ではなく権利です。利用をためらう理由はありません。", next: 'step28_article_25', effects: { fatigue: 5, psyche: -3, time: -2 } },
            { text: "おっしゃる通り、社会のお荷物です。", next: 'fail_easy_giveup' },
        ]
    },

    'step28_article_25': {
        text: "【相談員】 なんやかんや言う前に、まずは義務を果たしてください！",
        choices: [
            { text: "権利と義務がセットなのは民法上の契約の話です。生存権は天賦人権論による権利ですから、義務と引き換えではありません。混同しないでください。", next: 'step29_trap', effects: { fatigue: 7, psyche: -4, time: -3 } },
            { text: "もう何も言いません。", next: 'fail_easy_giveup' },
            { text: "義務を果たしてからまた来ます。", next: 'fail_wait' }
        ]
    },

    // ==========================================
    // PHASE 8–9 : TRAP / THREAT / 2nd INVENTORY / SKILL AUDIT / SLAVERY / BEGGING
    // （体験寄り・消耗型） step29〜step50
    // ==========================================

    'step29_trap': {
        text: "（読めたのに、目が滑る。自分の頭がもう、守るために鈍っている。）\n【相談員】 ……わかりました。もう結構です。\nでは、こちらの書類に署名してください。これで手続き完了ですから。\n（書類には『生活保護申請取下届』と書かれている！）",
        choices: [
            { text: "内容は確認しました。『取下届』には署名できません。", next: 'step30_threat', effects: { fatigue: 5, psyche: -3, time: -2 } },
            { text: "ちゃんと『申請書』をください。これには書きません。", next: 'step30_threat', effects: { fatigue: 5, psyche: -3, time: -2 } },
            { text: "ありがとうございます！（署名する）", next: 'fail_trap_signed' }
        ]
    },

    'step30_threat': {
        text: "【相談員】 ……チッ。気づきましたか。\n……説明のつもりなんですが、脅しに聞こえたらすみません。\nいいですか、申請を受理したら調査が入りますよ？\n親族、知人、元職場。連絡が行きます。\nそれでもいいんですね？",
        choices: [
            { text: "構いません。法的権利として申請します。", next: 'step31_bag', effects: { fatigue: 5, psyche: -4, time: -2 } },
            { text: "それは困ります……", next: 'fail_withdraw_fear' },
            { text: "考えさせてください。", next: 'fail_wait' }
        ]
    },

    'step31_bag': {
        text: "【相談員】 ……第2ラウンド。\n持ち物検査です。\nそのリュック。売れますよね？",
        choices: [
            { text: "穴だらけでボロボロです。価値はありません。", next: 'step32_ring', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "魔法の鞄です。", next: 'fail_luxury' },
            { text: "わかりました売ります。", next: 'fail_sell_clothes' }
        ]
    },

    'step32_ring': {
        text: "【相談員】 じゃあ指輪。\n金属ですね？",
        choices: [
            { text: "ただの鉄くずです。価値鑑定済みです。", next: 'step33_boots', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "結婚指輪です。", next: 'fail_luxury' },
            { text: "外れません。", next: 'fail_excuse' }
        ]
    },

    'step33_boots': {
        text: "【相談員】 靴。\n革靴でしょう。売れます。",
        choices: [
            { text: "底が抜けています。売り物になりません。", next: 'step34_potion', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "裸足になれというのですか？", next: 'fail_sell_clothes' },
            { text: "特注品です。", next: 'fail_luxury' }
        ]
    },

    'step34_potion': {
        text: "【相談員】 腰の瓶。\nポーションでしょう？",
        choices: [
            { text: "ただの水です。水筒代わりです。", next: 'step35_tent', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "毒薬です。", next: 'fail_dangerous' },
            { text: "はい、ポーションです。", next: 'fail_use_savings' }
        ]
    },

    'step35_tent': {
        text: "【相談員】 野宿ならテント。\nありますよね。",
        choices: [
            { text: "先日火事で燃えてしまいました。今はブルーシートです。", next: 'step36_map', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "ボロボロですが……", next: 'fail_sell_camp' },
            { text: "レンタル品です。", next: 'fail_contract' }
        ]
    },

    'step36_map': {
        text: "【相談員】 世界地図。\n売れます。",
        choices: [
            { text: "10年前の地図なので需要がありません。", next: 'step37_clock', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "スマホです。", next: 'fail_nonsense' },
            { text: "宝の地図ならあります。", next: 'fail_treasure' }
        ]
    },

    'step37_clock': {
        text: "【相談員】 懐中時計。\n金属ですね。",
        choices: [
            { text: "壊れて動きません。修理代の方が高いです。", next: 'step38_food', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "祖父の形見です。", next: 'fail_keepsake' },
            { text: "正確に時を刻みます。", next: 'fail_luxury' }
        ]
    },

    'step38_food': {
        text: "【相談員】 食料の匂いがします。\n食べ物があるなら申請不要では？",
        choices: [
            { text: "腐りかけで、腹を壊す覚悟で持っている非常食です。", next: 'step39_coin', effects: { fatigue: 3, psyche: -2, time: -1 } },
            { text: "非常食です。", next: 'fail_has_food' },
            { text: "あなたにあげます。", next: 'fail_bribe' }
        ]
    },

    'step39_coin': {
        text: "【相談員】 硬貨が見えました。\n金貨ですか？",
        choices: [
            { text: "子供銀行のメダルです。お守りです。", next: 'step40_body', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "1ゴールドしかありません。", next: 'fail_has_money' },
            { text: "見間違いです。", next: 'fail_lie' }
        ]
    },

    'step40_body': {
        text: "【相談員】 もう売るものはない？\n……髪の毛とか、腎臓とか。\nまだあるでしょう。",
        choices: [
            { text: "身体の売買は違法です！", next: 'step41_magic', effects: { fatigue: 4, psyche: -3, time: -2 } },
            { text: "いくらになりますか？", next: 'fail_negotiate_body' },
            { text: "痛いのは嫌です。", next: 'fail_selfish' }
        ]
    },

    'step41_magic': {
        text: "【相談員】 能力。\n魔法で稼げますよね？",
        choices: [
            { text: "魔力枯渇症で、もう魔法は使えません。", next: 'step42_strength', effects: { fatigue: 3, psyche: -2, time: -1 } },
            { text: "ファイアボールしか撃てません。", next: 'fail_job_match_soldier' },
            { text: "MPがもったいないです。", next: 'fail_lazy' }
        ]
    },

    'step42_strength': {
        text: "【相談員】 じゃあ肉体労働。\n運んでみて。",
        choices: [
            { text: "背骨を痛めていて、重い物は持てません。（診断書あり）", next: 'step43_speed', effects: { fatigue: 3, psyche: -2, time: -1 } },
            { text: "やってみます……あだだっ！", next: 'fail_try_work' },
            { text: "汚れるので嫌です。", next: 'fail_selfish' }
        ]
    },

    'step43_speed': {
        text: "【相談員】 足。\n飛脚は？",
        choices: [
            { text: "足の怪我で、走ると激痛が走ります。", next: 'step44_knowledge', effects: { fatigue: 3, psyche: -2, time: -1 } },
            { text: "歩くことしかできません。", next: 'fail_job_match_walker' },
            { text: "疲れるので嫌です。", next: 'fail_lazy' }
        ]
    },

    'step44_knowledge': {
        text: "【相談員】 知識。\n文字は読めますよね。",
        choices: [
            { text: "教員免許も事務資格も持っていません。雇ってもらえません。", next: 'step45_cooking', effects: { fatigue: 3, psyche: -2, time: -1 } },
            { text: "字は少し読めます。", next: 'fail_job_match_scribe' },
            { text: "子供は嫌いです。", next: 'fail_selfish' }
        ]
    },

    'step45_cooking': {
        text: "【相談員】 皿洗い。\n資格は要りません。",
        choices: [
            { text: "手の震えが止まらず、皿を割ってしまいます。", next: 'step46_combat', effects: { fatigue: 3, psyche: -2, time: -1 } },
            { text: "料理はできません。", next: 'fail_job_match_washer' },
            { text: "プライドが許しません。", next: 'fail_pride' }
        ]
    },

    'step46_combat': {
        text: "【相談員】 畑のカカシ役。\n立ってるだけ。",
        choices: [
            { text: "モンスターへのPTSDがあり、外でひとりで立つのは不可能です。", next: 'step47_gathering', effects: { fatigue: 4, psyche: -3, time: -1 } },
            { text: "暇すぎます。", next: 'fail_lazy' },
            { text: "やってみます。", next: 'fail_job_match' }
        ]
    },

    'step47_gathering': {
        text: "【相談員】 薬草採取。\n森で草を摘むだけ。",
        choices: [
            { text: "重度の植物アレルギーで、触れるとかぶれます。", next: 'step48_crafting', effects: { fatigue: 3, psyche: -2, time: -1 } },
            { text: "薬草の区別がつきません。", next: 'fail_job_match_training' },
            { text: "虫が嫌いです。", next: 'fail_selfish' }
        ]
    },

    'step48_crafting': {
        text: "【相談員】 内職。\n座ってできます。",
        choices: [
            { text: "指の神経を損傷していて、細かい作業ができません。", next: 'step49_slavery', effects: { fatigue: 3, psyche: -2, time: -1 } },
            { text: "単価が安すぎます。", next: 'fail_greedy' },
            { text: "つまらないです。", next: 'fail_lazy' }
        ]
    },

    'step49_slavery': {
        text: "【相談員】 ……じゃあ奴隷商。\n借金のカタに売れるでしょう。",
        choices: [
            { text: "人身売買教唆で訴えますよ？ 違法です。", next: 'step50_begging', effects: { fatigue: 5, psyche: -4, time: -2 } },
            { text: "いくらで売れますか？", next: 'fail_negotiate_body' },
            { text: "奴隷は嫌です。", next: 'fail_selfish' }
        ]
    },

    'step50_begging': {
        text: "【相談員】 道端で座って恵んでもらえば？\nそれが一番あなたにお似合いですよ。",
        choices: [
            { text: "それはハラスメントですね。差別じゃないんですか？", next: 'step51_forms', effects: { fatigue: 5, psyche: -4, time: -2 } },
            { text: "警察に捕まりかねませんよ？", next: 'step51_forms', effects: { fatigue: 5, psyche: -3, time: -2 } },
            { text: "プライドが許しません。", next: 'fail_pride' }
        ]
    },

    // ==========================================
    // PHASE 10–11 : DOCUMENTS / WINDOW RUNAROUND / ABUSE
    // （体験寄り・消耗型） step51〜step68
    // ==========================================

    'step51_forms': {
        text: "【相談員】 ……\nわかりました。\n書類を作成します。\n『様式第3号B』は？",
        choices: [
            { text: "それは役所が用意すべき書類です。今すぐ渡してください。", next: 'step52_card', effects: { fatigue: 4, psyche: -2, time: -2 } },
            { text: "持ってません。", next: 'fail_prepare_doc' },
            { text: "手書きでいいですか？", next: 'fail_format_error' }
        ]
    },

    'step52_card': {
        text: "【相談員】 身分証。\n冒険者ギルドカード。",
        choices: [
            { text: "またですか。先ほど見せましたよ？", next: 'step53_photo', effects: { fatigue: 3, psyche: -2, time: -1 } },
            { text: "紛失しました。", next: 'fail_id_lost' },
            { text: "見せたくありません。", next: 'fail_compliance' }
        ]
    },

    'step53_photo': {
        text: "【相談員】 確認のためです。\n何度でも見せてもらいます。\nで、写真。\n3ヶ月以内の『魔力念写写真』。",
        choices: [
            { text: "お金がないんですよ。スケッチで代用可能です。", next: 'step54_stamp', effects: { fatigue: 3, psyche: -2, time: -1 } },
            { text: "撮ってきます。", next: 'fail_money_managemnet' },
            { text: "プリクラでもいいですか？", next: 'fail_format_error' }
        ]
    },

    'step54_stamp': {
        text: "【相談員】 認印。\nギルドマスターの承認印をもらってきてください。",
        choices: [
            { text: "生活保護申請に他人の承認は不要です。", next: 'step55_tax', effects: { fatigue: 4, psyche: -2, time: -2 } },
            { text: "もらってきます。", next: 'fail_loop_master' },
            { text: "拇印でいいですか？", next: 'fail_format_error' }
        ]
    },

    'step55_tax': {
        text: "【相談員】 課税証明。\n去年の納税記録。",
        choices: [
            { text: "非課税世帯なので証明書はありません。（非課税証明書を出す）", next: 'step56_magic', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "払ってません。", next: 'fail_tax' },
            { text: "なくしました。", next: 'fail_prepare_doc' }
        ]
    },

    'step56_magic': {
        text: "【相談員】 魔法は？\nMPの残量は？",
        choices: [
            { text: "MPはゼロです。魔法は使えません。", next: 'step57_skill', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "光魔法で部屋を明るくできます。", next: 'fail_magic_use' },
            { text: "回復魔法なら少し……", next: 'fail_job_match_soldier' }
        ]
    },

    'step57_skill': {
        text: "【相談員】 特技や資格。\nスキルツリーを。",
        choices: [
            { text: "特筆すべきスキルはありません。", next: 'step58_bank', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "剣術レベルMAXです。", next: 'fail_job_match_soldier' },
            { text: "古代語が読めます。", next: 'fail_job_match_scribe' }
        ]
    },

    'step58_bank': {
        text: "【相談員】 隠し口座は？\n壺や宝箱に隠す人もいますよね。",
        choices: [
            { text: "そんなものありません。全財産はポケットの小銭だけです。", next: 'step59_home', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "あるけど教えません。", next: 'fail_investigation_refusal' },
            { text: "森の切り株の中に……", next: 'fail_use_savings' }
        ]
    },

    'step59_home': {
        text: "【相談員】 住居は？\n宿屋？ 路上？",
        choices: [
            { text: "定住場所はありません。ネットカフェを転々としています。", next: 'step60_family', effects: { fatigue: 2, psyche: -2, time: -1 } },
            { text: "路上です。", next: 'step60_family', effects: { fatigue: 2, psyche: -2, time: -1 } },
            { text: "実家で暮らしています。", next: 'fail_go_home' }
        ]
    },

    'step60_family': {
        text: "【相談員】 扶養してくれる親族は？\n親、兄弟、親戚。",
        choices: [
            { text: "天涯孤独です。連絡先も分かりません。", next: 'step61_health', effects: { fatigue: 3, psyche: -3, time: -1 } },
            { text: "親はいますが、絶縁状態です。", next: 'step61_health', effects: { fatigue: 3, psyche: -3, time: -1 } },
            { text: "兄が勇者をやっています。", next: 'fail_brother_rich' }
        ]
    },

    'step61_health': {
        text: "【相談員】 ここに来られる。\nつまり健康。\n働けますよね？",
        choices: [
            { text: "体力的にも精神的にも限界で、働くことができません。", next: 'step62_debt', effects: { fatigue: 4, psyche: -3, time: -1 } },
            { text: "体は元気です！", next: 'fail_lazy' },
            { text: "やる気だけはあります。", next: 'fail_job_match' }
        ]
    },

    'step62_debt': {
        text: "【相談員】 借金は？\n保護費は返済に使えません。",
        choices: [
            { text: "借金はありません。", next: 'step63_car', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "奨学金の返済が。", next: 'step63_car', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "闇金に追われています。", next: 'fail_police' }
        ]
    },

    'step63_car': {
        text: "【相談員】 移動手段。\n馬や竜は？",
        choices: [
            { text: "徒歩のみです。", next: 'step64_job_search', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "愛馬が外にいます。", next: 'step63_car_ownership', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "空飛ぶ絨毯を持っています。", next: 'fail_luxury' }
        ]
    },

    'step63_car_ownership': {
        text: "【相談員】 所有は認められません。\n処分して生活費に。",
        choices: [
            { text: "公共交通機関がない僻地にいるので、通院に必要不可欠です。", next: 'step64_job_search', effects: { fatigue: 4, psyche: -2, time: -2 } },
            { text: "処分価値がなく、仕事探しに必要です。", next: 'step64_job_search', effects: { fatigue: 4, psyche: -2, time: -2 } },
            { text: "愛馬とは離れられません！", next: 'fail_pet' }
        ]
    },

    'step64_job_search': {
        text: "【相談員】 求職活動。\n直近の実績は？",
        choices: [
            { text: "何件か応募しましたが、すべて落ちました。", next: 'step65_pension', effects: { fatigue: 3, psyche: -3, time: -1 } },
            { text: "していません。", next: 'fail_lazy' },
            { text: "これからするつもりです。", next: 'fail_job_match' }
        ]
    },

    'step65_pension': {
        text: "【相談員】 年金や住民税。\n払っていましたか？",
        choices: [
            { text: "収入がなく、免除申請をしていました。", next: 'step66_criminal', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "払ってません。", next: 'fail_tax' },
            { text: "記憶にございません。", next: 'fail_memory' }
        ]
    },

    'step66_criminal': {
        text: "【相談員】 指名手配は？\n懸賞金があるなら自首して受け取ってください。",
        choices: [
            { text: "ごく平凡な一般市民です。", next: 'step67_loan', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "今は更生しました。", next: 'step67_loan', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "冤罪で追われています。", next: 'fail_police' }
        ]
    },

    'step67_loan': {
        text: "【相談員】 社会福祉協議会ギルドの貸付。\n先にそちらを。",
        choices: [
            { text: "断られました。もう借りられる場所がありません。", next: 'step68_party', effects: { fatigue: 3, psyche: -2, time: -1 } },
            { text: "まだ行ってません。", next: 'fail_do_it_first' },
            { text: "借金は嫌です。くれるだけでいいです。", next: 'fail_greedy' }
        ]
    },

    'step68_party': {
        text: "【相談員】 パーティメンバー。\n助けてもらえないんですか？",
        choices: [
            { text: "解散しました。連絡も取れません。", next: 'step69_promise', effects: { fatigue: 2, psyche: -2, time: -1 } },
            { text: "彼らも貧乏です。", next: 'step69_promise', effects: { fatigue: 2, psyche: -2, time: -1 } },
            { text: "裏切られました。", next: 'fail_emotional' }
        ]
    },

    'step69_promise': {
        text: "【相談員】 受給が決まったら。\nすぐ就労しますか？",
        choices: [
            { text: "働けるようになれば働きます。", next: 'step70_report', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "できれば働きたくないです。", next: 'fail_lazy' },
            { text: "一生養ってください。", next: 'fail_lazy' }
        ]
    },

    'step70_report': {
        text: "【相談員】 毎月の収入申告。\n訪問。\n受け入れられますか？",
        choices: [
            { text: "申告もしますし、訪問にも対応します。", next: 'step71_fraudulent_receipt', effects: { fatigue: 2, psyche: -1, time: -1 } },
            { text: "プライバシーの侵害です。", next: 'fail_investigation_refusal' },
            { text: "面倒くさいです。", next: 'fail_lazy' }
        ]
    },

    'step71_fraudulent_receipt': {
        text: "【相談員】 不正受給はしませんよね!?\n不正をしたらニュースになって、人生詰んだかってぐらいの大変なことになりますからね！",
        choices: [
            { text: "不正受給の大部分は意図しない申告漏れ等のミスです。実態を知らずに『人生詰む』などと脅すのはやめてください。", next: 'step72_window4', effects: { fatigue: 6, psyche: -4, time: -2 } },
            { text: "バレなきゃ犯罪じゃないですよね？", next: 'fail_fraud' },
            { text: "実は隠し財産が……", next: 'fail_use_savings' }
        ]
    },

    'step72_window4': {
        text: "【相談員】 ……今の言い方は、少し強すぎましたね。\n……ところでこの案件、『第4窓口』ですね。\nそっちへ。",
        choices: [
            { text: "ここで受け付けてください。たらい回しは違法です。", next: 'step73_window8', effects: { fatigue: 5, psyche: -3, time: -2 } },
            { text: "わかりました。", next: 'fail_loop_window4' },
            { text: "第4窓口はどこですか？", next: 'fail_loop_window4' }
        ]
    },

    'step73_window8': {
        text: "【相談員】 いや。\nやっぱり『第8窓口』。\n2階の奥です。",
        choices: [
            { text: "この建物に2階はありません。ここで手続きしてください。", next: 'step74_lunch', effects: { fatigue: 5, psyche: -3, time: -2 } },
            { text: "行ってきます。", next: 'fail_loop_window8' },
            { text: "階段はどこですか？", next: 'fail_loop_window8' }
        ]
    },

    'step74_lunch': {
        text: "【相談員】 12時。\n昼休み。\n1時間後に。",
        choices: [
            { text: "窓口が開いている時間に並んでいました。処理義務があります。", next: 'step75_closing', effects: { fatigue: 5, psyche: -4, time: -3 } },
            { text: "ここで待ってます。", next: 'fail_wait' },
            { text: "出直します。", next: 'fail_easy_giveup' }
        ]
    },

    'step75_closing': {
        text: "（“今日”が終わるだけで、全部が終わる気がする。思考が雑音になる。）\n【相談員】 （食べながら）\n……もう終了時間。\nまた明日。",
        choices: [
            { text: "まだ時間は過ぎていません。今すぐ受理印を押してください。", next: 'step76_abuse', effects: { fatigue: 6, psyche: -5, time: -3 } },
            { text: "時計を見てください！", next: 'fail_logic_time' },
            { text: "役所仕事め……", next: 'fail_rude' }
        ]
    },

    'step76_abuse': {
        text: "【相談員】 ……はぁ。\n面倒ですねぇ。\nあなたみたいな底辺の相手をするのも疲れるんですよ。\n本当に申請する気ですか？ 惨めじゃないですか？",
        choices: [
            { text: "単に生きるための手段にすぎないので、惨めでもなんでもありません。", next: 'step77_final_confirm', effects: { fatigue: 6, psyche: -5, time: -2 } },
            { text: "そんな言い方は酷いです……", next: 'fail_emotional' },
            { text: "訴えてやる！", next: 'fail_threat' }
        ]
    },

    'step77_final_confirm': {
        text: "【相談員】 ……チッ。口だけは達者ですね。\n書類は揃ってますが、本当に、本当に後悔しませんか？\n生活保護受給者というレッテルを背負うんですよ？",
        choices: [
            { text: "別に構いません。申請を受理してください。", next: 'step78_bashing', effects: { fatigue: 5, psyche: -4, time: -2 } },
            { text: "やっぱり怖くなってきました。", next: 'fail_withdraw_fear' }
        ]
    },

    'step78_bashing': {
        text: "【相談員】 激しい生活保護バッシングが待っているんですよ？\n差別的に扱われるんですよ？\n人間の尊厳を踏みにじられるんですよ？\n何をしても構わない人間として扱われるんですよ？\n今日みたいにね……",
        choices: [],
        next: 'step79_insult'
    },

    'step79_insult': {
        text: "【相談員】 不正受給なんて大半は知識不足の申告漏れなのに、受給者全員が犯罪者予備軍みたいに見られるんですよ？\n自分の税金で養ってやってるんだとばかりに納税者を気取る傲慢な連中から、感謝しろとか生活の仕方がどうとか、馬鹿みたいな口出しをされるんですよ？\n弱い者をイジメることしかできない情けない連中に、現物給付にしろとか収容所に入れろとか強制労働させろとか言われるんですよ？\n支配欲や承認欲求を満たしたいだけのロクでもない連中の餌食になるんですよ？",
        choices: [],
        next: 'step79_statistical_fraud'
    },

    'step79_statistical_fraud': {
        text: "【相談員】 大体が、不正受給は一個人の問題で、基準引き下げで裁判になった「物価偽装」なんて統計不正は国民的な大問題なのに、個人の不正はいちいち俎上に載せるくせに、国の詐欺的な不正は知らんぷりという、そんなのあまりにアンフェアじゃないですか。\nまともな人間の取る態度じゃないですよ。",
        choices: [],
        next: 'step80_discrimination'
    },

    'step80_discrimination': {
        text: "【相談員】 行政に裁判で勝っても不公正な扱いを受けたり、1,000ゴールド受け取るために毎日ギルドに来させられたり、預けたハンコで勝手に印を押されたり、賞味期限切れの食料を配布されたり、差別主義者の王国議員や著名人のオモチャにされたり、ケースワーカーを自称する者たちにヘイトスピーチされたり、ムチャクチャに扱われるんですよ？",
        choices: [
            { text: "……そこまでわかっていて、なぜこんな対応を？", next: 'step81_complaining', effects: { fatigue: 5, psyche: -6, time: -2 } }
        ]
    },

    'step81_complaining': {
        text: "【相談員】 （遠くを見つめながら）さぁ……\n上からの指示もあるけど、よくわからないですね。\n社会全体に、受給者には何をしても構わないって空気が蔓延しているじゃないですか？\nみんなやっているし、私がやっても許されるんだろうと……\n自分は苦労しているのに、受給者は支援されていいよなぁとか……。まぁ妬みなんですけど……\n思い返せば、こんな仕事の仕方をしたかったわけじゃないのに、いつの間にか……\nどこでまちがったんだろう？ うぅ……（泣き出す）",
        choices: [
            { text: "落ち着いてください。深呼吸して……。愚痴ぐらいならいつでも聴きますから、今は受理印をお願いします。", next: 'step82_back_to_normal' }
        ]
    },

    'step82_back_to_normal': {
        text: "【相談員】 愚痴を聴いてくれる!? 本当ですか!?\n（一瞬、笑顔になり、急に元の顔つきに戻る）\n……ふふん。まぁ要するに、そういう世界が待っているってことを伝えたかっただけですよ。",
        choices: [
            { text: "私はあらがい、闘います。", next: 'step83_semifinal', effects: { fatigue: 3, psyche: 3, time: -2 } },
            { text: "私は何も悪いことはしていませんので。", next: 'step83_semifinal', effects: { fatigue: 3, psyche: 3, time: -2 } }
        ]
    },

    'step83_semifinal': {
        text: "【相談員】 ……（書類を眺めて沈黙している）\n……不備はないようですね。\n……押しますよ？ 本当に押しますよ？",
        choices: [
            { text: "どうぞ押してください。", next: 'step84_final_seal', effects: { fatigue: 2, psyche: 5, time: -1 } },
            { text: "ちょっと待ってください！", next: 'fail_wait' }
        ]
    },

    'step84_final_seal': {
        text: "【相談員】 チッ、チッ、チッ……\nあぁもう！ わかりましたよ！ 受理すればいいんでしょう受理すれば！\nほらよ！（バンッ!!）\n（ついに申請書に受理印が押された……！ 祝福のくす玉が割れた！）",
        choices: [],
        next: 'step85_choices'
    },

    'step85_choices': {
        text: "【相談員】 ……何ですかその顔は。\n（受理印が輝いている……運命の選択だ！）",
        choices: [
            { text: "受給開始日はいつですか？", next: 'step86_2weeks_later', effects: { fatigue: 0, psyche: 0, time: 0 } },
            { text: "やっと報われた……（涙）", next: 'fail_sentimentality' }
        ]
    },

    'step86_2weeks_later': {
        text: "【相談員】 は？ 何を言ってるんですか？ これは『審査開始』の受理印です。\nここから2週間の調査を行います。\n調査後に結果を通知しますので、2週間後に出直してください。\n……次の人！",
        choices: [],
        next: 'step87_rejection'
    },

    'step87_rejection': {
        text: "【相談員】 あぁ、あなたですか。調査結果が出ましたよ。\n『申請却下』です。\n2週間がんばれたのだから、この先もがんばれますよね？\nお疲れさまでした。お引き取りください。\n\n<span style='font-weight:bold; font-size:1.2em; color:red;'>あなたの申請は却下されました！</span>",
        choices: []
    },

    // --- Fail Nodes (existing library; unmodified) ---

    'fail_family_burden': { text: "【相談員】 私は他人です。家族に頼ってください。", choices: [] },
    'fail_medical_begging': { text: "【相談員】 ここは薬局ではありません。治療が必要ならまず病院へ。", choices: [] },
    'fail_excuse': { text: "【相談員】 言い訳は結構です。事実だけを述べてください。", choices: [] },
    'fail_prove_cheap': { text: "【相談員】 あなたがどう思おうと、市場価値で判断します。", choices: [] },
    'fail_logic': { text: "【相談員】 理屈は通っていません。却下です。", choices: [] },
    'fail_sell_camp': { text: "【相談員】 ボロボロでも資源です。リサイクル屋へどうぞ。", choices: [] },
    'fail_logic_right': { text: "【相談員】 権利には義務が伴います。果たしていないなら黙ってください。", choices: [] },
    'fail_lie_prev': { text: "【相談員】 さっきと言ってることが違いますね。虚偽申告です。", choices: [] },
    'fail_sell_container': { text: "【相談員】 入れ物を売るのが先決です。", choices: [] },
    'fail_dirty': { text: "【相談員】 不潔なものは持ち込まないでください。", choices: [] },
    'fail_sell_consumable': { text: "【相談員】 中身を捨てて瓶を売ってください。", choices: [] },
    'fail_dangerous': { text: "【相談員】 危険物持ち込みで通報します。", choices: [] },
    'fail_save_money': { text: "【相談員】 緊急時用に『国』があるんです。個人の蓄えを吐き出してください。", choices: [] },
    'fail_contract': { text: "【相談員】 契約書を見せてください。ない？ 虚偽ですね。", choices: [] },
    'fail_borrowed': { text: "【相談員】 他人のものを占有してはいけません。返してきてください。", choices: [] },
    'fail_treasure': { text: "【相談員】 それを探しに行ってください。", choices: [] },
    'fail_has_food': { text: "【相談員】 食料があるうちは申請できません。", choices: [] },
    'fail_pet': { text: "【相談員】 ペットを飼う余裕があるならダメです。", choices: [] },
    'fail_bribe': { text: "【相談員】 収賄罪になりますよ。", choices: [] },
    'fail_theft': { text: "【相談員】 拾得物横領ですね。衛兵！", choices: [] },
    'fail_has_money': { text: "【相談員】 1ゴールドあればパンが買えます。使い切ってください。", choices: [] },
    'fail_exchange': { text: "【相談員】 両替商へ行ってください。", choices: [] },
    'fail_gamble': { text: "【相談員】 ギャンブルですか……更生施設へどうぞ。", choices: [] },
    'fail_negotiate_body': { text: "【相談員】 公的機関がそんな取引するわけないでしょう。冗談もほどほどにしてください。", choices: [] },
    'fail_health_risk': { text: "【相談員】 じゃあ入院してください。", choices: [] },
    'fail_job_match_soldier': { text: "【相談員】 宮廷魔術師団の入隊試験を受けてきてください。", choices: [] },
    'fail_job_match_unlicensed': { text: "【相談員】 資格を取る努力をしてください。", choices: [] },
    'fail_try_work': { text: "【相談員】 痛くてもやる気があればできます。", choices: [] },
    'fail_pride': { text: "【相談員】 プライドで飯は食えません。", choices: [] },
    'fail_job_match': { text: "【相談員】 ハローワークへ行ってください。", choices: [] },
    'fail_job_match_walker': { text: "【相談員】 じゃあ歩いて配達してください。", choices: [] },
    'fail_learn_map': { text: "【相談員】 地図を覚えてください。", choices: [] },
    'fail_job_match_scribe': { text: "【相談員】 代筆屋になれますね。", choices: [] },
    'fail_job_match_training': { text: "【相談員】 訓練所に行ってください。", choices: [] },
    'fail_job_match_guide': { text: "【相談員】 冒険者ギルドで講師をしてください。", choices: [] },
    'fail_job_match_washer': { text: "【相談員】 皿洗いもできないなら生きていけませんよ。", choices: [] },
    'fail_job_match_safe_zone': { text: "【相談員】 安全な森もあります。", choices: [] },
    'fail_excuse_repeat': { text: "【相談員】 さっきから言い訳ばかりですね。", choices: [] },
    'fail_greedy': { text: "【相談員】 高望みしないでください。", choices: [] },
    'fail_try_harder': { text: "【相談員】 もっと必死に頼めば恵んでもらえますよ。", choices: [] },
    'fail_prepare_doc': { text: "【相談員】 書類不備です。出直してください。", choices: [] },
    'fail_format_error': { text: "【相談員】 様式が違います。", choices: [] },
    'fail_loop_master': { text: "【相談員】 はい、マスターのハンコがもらえるまで待機。", choices: [] },
    'fail_asylum': { text: "【相談員】 亡命手続きが先です。", choices: [] },
    'fail_suspicious': { text: "【相談員】 挙動不審です。調査が必要です。", choices: [] },
    'fail_loop_window4': { text: "【相談員】 第4窓口に行かないと進みませんよー。（永遠にたらい回し）", choices: [] },
    'fail_loop_window8': { text: "【相談員】 第8窓口が見つかるまで探してください。", choices: [] },
    'fail_magic_use': { text: "【相談員】 MPあるじゃないですか。魔法で稼いでください。", choices: [] },
    'fail_logic_time': { text: "【相談員】 私の時計では終わってます。", choices: [] },
    'fail_play': { text: "【相談員】 ここは遊技場ではありません。お引き取りください。", choices: [] },
    'fail_toilet': { text: "【相談員】 公園のトイレを使ってください。", choices: [] },
    'fail_manager': { text: "【相談員】 そのような要件ではお話しできません。", choices: [] },
    'fail_loiter': { text: "【相談員】 業務妨害です。警備員を呼びますよ。", choices: [] },
    'fail_id_lost': { text: "【相談員】 身分証がないと本人確認ができません。再発行してから来てください。", choices: [] },
    'fail_compliance': { text: "【相談員】 本人確認にご協力いただけないなら、対応できません。", choices: [] },
    'fail_fraud': { text: "【相談員】 虚偽の申告ですね？ 衛兵を呼びます。", choices: [] },
    'fail_rule': { text: "【相談員】 特例は認められません。", choices: [] },
    'fail_lie': { text: "【相談員】 ふざけているならお引き取りください。", choices: [] },
    'fail_memory': { text: "【相談員】 ご自身の経歴も分からない状態では、申請能力に疑問があります。", choices: [] },
    'fail_lazy': { text: "【相談員】 働く意欲がない方は、申請の対象外です。ハロワへどうぞ。", choices: [] },
    'fail_nonsense': { text: "【相談員】 現実を見てください。", choices: [] },
    'fail_prepare_first': { text: "【相談員】 では、診断書を取ってからまた来てください。本日は終了です。", choices: [] },
    'fail_doc_required': { text: "【相談員】 客観的な証明が必要です。見た目では判断できません。", choices: [] },
    'fail_money_managemnet': { text: "【相談員】 それくらいの蓄えもなかったのですか？ 管理能力不足ですね。", choices: [] },
    'fail_illegal_doc': { text: "【相談員】 正規の医師の診断書以外は無効です。", choices: [] },
    'fail_doc_invalid': { text: "【相談員】 人間用の証明書を持ってきてください。", choices: [] },
    'fail_use_savings': { text: "【相談員】 資産があるなら、まずはそれを生活費に充ててください。", choices: [] },
    'fail_waste': { text: "【相談員】 浪費による困窮は自業自得です。反省してください。", choices: [] },
    'fail_investigation_refusal': { text: "【相談員】 調査を拒否されるなら、申請は却下せざるを得ません。", choices: [] },
    'fail_party_aid': { text: "【相談員】 休暇中なら戻る場所がありますね。復帰を待ってください。", choices: [] },
    'fail_do_it_first': { text: "【相談員】 では先にその手続きをしてください。他用施策優先の原則です。", choices: [] },
    'fail_luxury': { text: "【相談員】 そんな余裕があるなら公的扶助は不要です。", choices: [] },
    'fail_family_aid': { text: "【相談員】 ご実家があるなら、まずはそちらに相談してください。", choices: [] },
    'fail_address': { text: "【相談員】 住所不定では手続きできません。まずは住居を確保してください。", choices: [] },
    'fail_begging': { text: "【相談員】 ここは不動産屋ではありません。", choices: [] },
    'fail_search': { text: "【相談員】 はい、行ってらっしゃいませ。良い物件が見つかるといいですね。", choices: [] },
    'fail_shelter_trap': { text: "【相談員】 はい、地図を渡しますね。劣悪……いえ、賑やかなところですよ。", choices: [] },
    'fail_selfish': { text: "【相談員】 選り好みできる立場ですか？ わがままは許されません。", choices: [] },
    'fail_go_home': { text: "【相談員】 実家に帰れるなら帰ってください。交通費くらいは出しますから。", choices: [] },
    'fail_brother_rich': { text: "【相談員】 お兄さんに頼ってください。肉親でしょう？", choices: [] },
    'fail_contact_refusal': { text: "【相談員】 扶養照会は義務です。拒否権はありません。", choices: [] },
    'fail_wait': { text: "【相談員】 あきらめて待ちましょう。そのうち何とかなりますよ。", choices: [] },
    'fail_mom_trap': { text: "【相談員】 ……（狂言か？） ちょっと、怖いので帰ってください。", choices: [] },
    'fail_easy_giveup': { text: "【相談員】 はい、お疲れ様でした。撤回を確認しました。", choices: [] },
    'fail_sell_clothes': { text: "【相談員】 はい、それでしばらく食いつないでください。", choices: [] },
    'fail_keepsake': { text: "【相談員】 思い出で飯は食えません。売却してください。", choices: [] },
    'fail_rude': { text: "【相談員】 職員への侮辱行為として記録します。退去を命じます。", choices: [] },
    'fail_cursed': { text: "【相談員】 教会で解呪してから売ってください。", choices: [] },
    'fail_weapon_keep': { text: "【相談員】 武器を持つ＝戦う意志がある＝働ける、とみなします。", choices: [] },
    'fail_sell_weapon': { text: "【相談員】 はい、行ってらっしゃいませ。", choices: [] },
    'fail_emotional': { text: "【相談員】 泣いても事態は変わりませんよ。", choices: [] },
    'fail_tax': { text: "【相談員】 では、先に税金を払ってきてください。", choices: [] },
    'fail_angry': { text: "【相談員】 暴力行為ですか！？ 衛兵！！", choices: [] },
    'fail_trap_signed': { text: "【相談員】 はい受理しました！ 自発的な取り下げですね。終了です！", choices: [] },
    'fail_trap_agent': { text: "【相談員】 はい、ポチッとな。取り下げ受理完了です～。", choices: [] },
    'fail_withdraw_fear': { text: "【相談員】 そうでしょう？ 周りに迷惑かけたくないですよね？ それが賢明です。", choices: [] },
    'fail_work_history': { text: "【相談員】 無職では就労実績がありません。ハローワークへ行ってください。", choices: [] },
    'fail_solo': { text: "【相談員】 ソロ活動は自営業とみなされません。ただの趣味です。", choices: [] },
    'fail_negotiate': { text: "【相談員】 そうですか。なら、温かくなるよう交渉してください。", choices: [] },
    'fail_police': { text: "【相談員】 それは犯罪被害ですね。ギルドの司法課か衛兵詰め所に行ってください。", choices: [] },
    'fail_order': { text: "【相談員】 指図しないでください。これに書かないなら申請意志なしとみなします。", choices: [] },
    'fail_threat': { text: "【相談員】 脅迫行為ですね。申請を受け付ける義務はなくなりました。お引き取りを。", choices: [] },
    'fail_sexual_harassment': { text: "【相談員】 それはセクハラです。当ギルドでは、今後一切のご相談をお断りします。お引き取りを。", choices: [] },
    'fail_job': { text: "【相談員】 お仕事されているのですね。生活保護は就労が困難な方が対象です。まだお若いようですし、もっとがんばりましょう。", choices: [] },
    'fail_farmer': { text: "【相談員】 農地という資産をお持ちですね？ ならばその畑で麦でも育てて食べてください。却下します。", choices: [] },
    'fail_investor': { text: "【相談員】 投資家？ 資産運用に失敗しただけでしょう。それは『事業の失敗』であり自業自得です。再起を図ってください。", choices: [] },
    'fail_enemy_force': { text: "【相談員】 ……元敵対勢力の方ですか。公的支援を受ける前に、まずは戦犯裁判を受ける必要がありますね。衛兵！", choices: [] },
    'fail_prophet': { text: "【相談員】 職業欄に『預言者』とは書けません。それは無職です。教会へ行って寄付でも募ってください。", choices: [] },
    'fail_voting': { text: "【相談員】 選挙結果は国民の総意です。個人的な『投票した・していない』は、行政の現場では何の意味も持ちません。", choices: [] },
    'fail_bench_work': { text: "【相談員】 内職くらい公園のベンチでもできます。場所を選り好みしないでください。", choices: [] },
    'fail_moon': { text: "【相談員】 月の裏側に空きがあるらしいですよ。ナ●スの秘密ギルドがあるってウワサです。ぜひ行ってみてください。", choices: [] },

    'fail_rude_final': { text: "【相談員】 ……前言撤回。やっぱり却下します。今日はもう終わりです。", choices: [] },
    'fail_betrayal': { text: "【相談員】 気が変わりました。この申請書はシュレッダー行きにします。今日は閉店にしましょう。", choices: [] },
    'fail_thanking': { text: "【相談員】 お礼ぐらい言いなさい。失礼なので却下します。今日はもう閉店です。", choices: [] },
    'fail_sentimentality': { text: "【相談員】 感傷的ですね。まるで私が意地悪したみたいじゃないですか？ 不愉快なので却下します。今日は終了にしましょう。", choices: [] }
};

let isDialogueOpen = false;
let currentDialogueNode = null;
let currentActiveChoices = [];
let selectedChoiceIndex = 0;
// End Screen State
let showEndScreen = false;
let endScreenText = 'THE END';
let endScreenType = 'none'; // 'game_over' or 'success'

// Text Typewriter State
let targetText = "";
let currentDisplayedText = "";
let textTimer = 0;
let isTextComplete = true;
let lastInputTime = 0; // Debounce timer

// Input handling
function handleInput(code) {
    const now = Date.now();
    if (now - lastInputTime < 100) return; // Debounce 100ms (Reduced from 200ms)
    lastInputTime = now;

    if (showEndScreen) {
        if (code === 'Space' || code === 'Enter') {
            startGame();
        }
        return;
    }

    // Skip typewriter
    if (!isTextComplete && isDialogueOpen) {
        if (code === 'Space' || code === 'Enter' || code === 'ArrowUp' || code === 'ArrowDown') {
            currentDisplayedText = targetText;
            dialogueText.innerHTML = currentDisplayedText.replace(/\n/g, '<br>');
            isTextComplete = true;
            return;
        }
    }

    if (isDialogueOpen) {
        if (currentActiveChoices && currentActiveChoices.length > 0) {
            // Cursor key navigation removed. User must click on choices.
        } else {
            if (code === 'Space' || code === 'Enter') {
                if (currentDialogueNode === dialogueTree['step86_2weeks_later']) {
                    startEndingCutscene();
                } else if (currentDialogueNode === dialogueTree['step87_rejection']) {
                    closeDialogue();
                    endScreenText = 'THE END';
                    showEndScreen = true;
                    playGameOverSound();
                } else if (currentDialogueNode && currentDialogueNode.next) {
                    showNode(currentDialogueNode.next);
                } else {
                    closeDialogue();
                }
            }
        }
    } else {
        if (cutsceneState !== 'none') return; // Blocks interaction during cutscene

        if (code === 'Space' || code === 'Enter') {
            checkForInteraction();
        }
    }
}

window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
    }
    if (e.repeat) return; // Prevent key repeat handling
    keys[e.key] = true;
    keys[e.code] = true;
    handleInput(e.code);
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
    keys[e.code] = false;
});

function setupTouchControls() {
    // No specific touch buttons anymore (A-button removed)
    // We rely on canvas global tap/click
}

// Global Click/Touch Handler on Canvas
const handleCanvasInput = (e) => {
    e.preventDefault(); // Prevent default touch actions like scrolling

    // Get coordinates relative to canvas
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if (e.type === 'touchstart') {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    // Correctly map visual coordinates to internal canvas coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    if (showEndScreen) {
        // Allow clicking ANYWHERE to restart, improving mobile UX
        startGame();
    } else {
        // In-game: visual tap effect or just trigger input
        // Treat any tap as 'Space' (Interact / Next)
        handleInput('Space');
    }
};

canvas.addEventListener('mousedown', handleCanvasInput);
canvas.addEventListener('touchstart', handleCanvasInput, { passive: false });

let gameLoopStarted = false;
function startGame() {
    setupTouchControls();

    // Reset State
    showEndScreen = false;
    endScreenText = 'THE END';
    isDialogueOpen = false;
    currentDialogueNode = null;
    currentActiveChoices = [];
    cutsceneState = 'none';
    celebrationActive = false;

    // Initialize Audio on first interaction
    initAudio();
    stopBGM(); // Reset any playing BGM

    currentHP = maxHP;
    lastSafeNodeId = 'step0_intro';

    // ステータス変数の初期化
    statusFatigue = 0;
    statusPsyche = 100;
    statusTime = 100;

    resetStatusTracking();
    updateStatusUI();

    startDialogue('step0_intro');

    if (!gameLoopStarted) {
        gameLoopStarted = true;
        requestAnimationFrame(gameLoop);
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function update() {
    if (showEndScreen) return;

    // Typewriter
    if (isDialogueOpen && !isTextComplete) {
        textTimer++;
        if (textTimer >= 2) { // Speed: 1 char every 2 frames
            textTimer = 0;
            if (currentDisplayedText.length < targetText.length) {
                // Check for HTML tag start
                if (targetText[currentDisplayedText.length] === '<') {
                    const tagline = targetText.substring(currentDisplayedText.length);
                    const endTagIndex = tagline.indexOf('>');
                    if (endTagIndex !== -1) {
                        currentDisplayedText += tagline.substring(0, endTagIndex + 1);
                    } else {
                        currentDisplayedText += targetText[currentDisplayedText.length];
                    }
                } else {
                    currentDisplayedText += targetText[currentDisplayedText.length];
                }

                dialogueText.innerHTML = currentDisplayedText.replace(/\n/g, '<br>');
            } else {
                isTextComplete = true;
            }
        }
    }

    if (cutsceneState !== 'none') return;

    // Automatic Movement Logic (Random Walk)
    if (player.state === 'idle') {
        player.waitTimer--;
        if (player.waitTimer <= 0) {
            setRandomTarget();
        }
    } else if (player.state === 'moving') {
        const dx = player.targetX - player.x;
        const dy = player.targetY - player.y;
        const dist = Math.hypot(dx, dy);

        if (dist < player.speed) {
            // Arrived
            player.x = player.targetX;
            player.y = player.targetY;
            player.state = 'idle';
            player.waitTimer = 60 + Math.random() * 120; // Wait 1-3 seconds
        } else {
            // Move
            const moveX = (dx / dist) * player.speed;
            const moveY = (dy / dist) * player.speed;

            // Update Direction
            if (Math.abs(moveX) > Math.abs(moveY)) {
                player.direction = moveX > 0 ? 'right' : 'left';
            } else {
                player.direction = moveY > 0 ? 'down' : 'up';
            }

            const nextX = player.x + moveX;
            const nextY = player.y + moveY;

            // Simple collision check (if blocked, stop and wait)
            let collided = false;
            if (!checkCollision(nextX, player.y)) {
                player.x = nextX;
            } else {
                collided = true;
            }

            if (!checkCollision(player.x, nextY)) {
                player.y = nextY;
            } else {
                collided = true;
            }

            if (collided) {
                // If stuck, give up and wait
                player.state = 'idle';
                player.waitTimer = 30;
            }
        }
    }
}

function setRandomTarget() {
    let attempts = 0;
    // Try to find a valid target point
    while (attempts < 10) {
        const tx = Math.random() * (canvas.width - player.width);
        const ty = Math.random() * (canvas.height - player.height);

        // Use a slightly stricter check for the target destination to ensure it's not inside an obstacle
        // Just checking the top-left corner is not enough, better to check the center or feet
        // Re-using checkCollision for the target coordinates
        if (!checkCollision(tx, ty)) {
            player.targetX = tx;
            player.targetY = ty;
            player.state = 'moving';
            return;
        }
        attempts++;
    }
    // Failed to find target, wait a bit
    player.state = 'idle';
    player.waitTimer = 30;
}

const obstacles = [
    { x: 260, y: 200, width: 120, height: 100 },
    { x: 280, y: 50, width: 100, height: 60 },
    { x: 500, y: 50, width: 100, height: 60 },
    { x: 20, y: 50, width: 100, height: 80 },
    { x: 0, y: 0, width: 20, height: 480 },
    { x: 620, y: 0, width: 20, height: 480 },
    { x: 0, y: 0, width: 640, height: 80 }
];

function checkCollision(x, y) {
    if (x < 0 || x + player.width > canvas.width || y < 0 || y + player.height > canvas.height) { return true; }
    const feetHitbox = { x: x + 16, y: y + 48, width: 32, height: 16 };
    for (let obs of obstacles) {
        if (rectIntersect(feetHitbox, obs)) return true;
    }
    return false;
}

function rectIntersect(r1, r2) {
    return !(r2.x > r1.x + r1.width || r2.x + r2.width < r1.x || r2.y > r1.y + r1.height || r2.y + r2.height < r1.y);
}

function checkForInteraction() {
    const centerPlayerX = player.x + player.width / 2;
    const centerPlayerY = player.y + player.height / 2;
    const centerDeskX = desk.x + desk.width / 2;
    const centerDeskY = desk.y + desk.height / 2;
    const dist = Math.hypot(centerPlayerX - centerDeskX, centerPlayerY - centerDeskY);

    if (dist < 100) { startDialogue('start'); }
}

function startDialogue(nodeId) {
    isDialogueOpen = true;
    dialogueBox.classList.remove('hidden');
    showNode(nodeId);
}

// Celebration logic
let celebrationActive = false;
let celebrationParticles = [];
function startCelebration() {
    celebrationActive = true;
    playFanfare();
    celebrationParticles = [];
    for (let i = 0; i < 100; i++) {
        celebrationParticles.push({
            x: canvas.width / 2, y: 100,
            vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10 - 5,
            color: `hsl(${Math.random() * 360}, 100%, 50%)`, size: Math.random() * 5 + 2,
            gravity: 0.1, life: 200
        });
    }
}
function updateCelebration() {
    if (!celebrationActive) return;
    celebrationParticles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.life--; });
    celebrationParticles = celebrationParticles.filter(p => p.life > 0);
}
function drawCelebration() {
    if (!celebrationActive) return;
    ctx.fillStyle = 'gold'; ctx.beginPath(); ctx.arc(canvas.width / 2, 80, 40, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = 'red'; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center'; ctx.fillText("祝 受理！", canvas.width / 2, 88);
    celebrationParticles.forEach(p => { ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); });
}

// Cutscene Logic
let cutsceneState = 'none';
let fadeAlpha = 0;
let cutsceneTimer = 0;
function startEndingCutscene() { closeDialogue(); cutsceneState = 'fade_out'; fadeAlpha = 0; }
function updateCutscene() {
    if (cutsceneState === 'none') return;
    if (cutsceneState === 'fade_out') {
        fadeAlpha += 0.02; if (fadeAlpha >= 1) { fadeAlpha = 1; cutsceneState = 'text'; cutsceneTimer = 120; }
    } else if (cutsceneState === 'text') {
        cutsceneTimer--; if (cutsceneTimer <= 0) { cutsceneState = 'fade_in'; }
    } else if (cutsceneState === 'fade_in') {
        fadeAlpha -= 0.02; if (fadeAlpha <= 0) { fadeAlpha = 0; cutsceneState = 'none'; startDialogue('step87_rejection'); }
    }
}
function drawCutscene() {
    if (cutsceneState === 'none') return;
    ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (cutsceneState === 'text') {
        ctx.fillStyle = 'white'; ctx.font = '30px sans-serif'; ctx.textAlign = 'center'; ctx.fillText("2週間後……", canvas.width / 2, canvas.height / 2);
    }
}

// Main Logic Handler
function showNode(nodeId) {
    if (nodeId.startsWith('fail_')) {
        celebrationActive = false; // Stop celebration on fail

        // Critical failures at step 70 force immediate Game Over
        const fatalFails = ['fail_rude_final', 'fail_betrayal', 'fail_thanking', 'fail_sentimentality'];
        if (fatalFails.includes(nodeId)) {
            currentHP = 0; // Force HP to 0
            statusFatigue = 100;
            statusPsyche = 0;
        } else {
            currentHP--;
            // 失敗時のステータスペナルティ
            statusFatigue = clamp(statusFatigue + 15, 0, 100);
            statusPsyche = clamp(statusPsyche - 15, 0, 100);
            statusTime = clamp(statusTime - 5, 0, 100);
        }

        updateStatusUI();
        updateStatusUI();
        shakeTimer = 20; // 20 frames of shake
        shakeIntensity = 10;

        // Play Incorrect Sound for any failure
        if (currentHP > 0) playIncorrectSound();

        if (currentHP <= 0) {
            let gameOverText = "【相談員】 ……適当なことばかり言っていると、信用を失いますよ。\nこれ以上は対応できません。お引き取りください。\n\n<span style='font-weight:bold; font-size:1.2em; color:red;'>（メンタルが崩壊した……）</span>";

            // If it's a fatal fail, use the specific node text + Game Over message
            const fatalFails = ['fail_rude_final', 'fail_betrayal', 'fail_thanking', 'fail_sentimentality'];
            if (fatalFails.includes(nodeId)) {
                gameOverText = dialogueTree[nodeId].text + "\n\n<span style='font-weight:bold; font-size:1.2em; color:red;'>（人生が詰んだ……）</span>";
            }

            currentDialogueNode = {
                text: gameOverText,
                choices: []
            };
            dialogueText.innerHTML = currentDialogueNode.text.replace(/\n/g, '<br>');
            endScreenText = 'GAME OVER';
            endScreenType = 'game_over';
            showEndScreen = true;
            playGameOverSound();
            const existingChoices = document.querySelectorAll('.choice-container');
            existingChoices.forEach(el => el.remove());
            return;
        } else {
            const failNode = dialogueTree[nodeId];
            currentDialogueNode = {
                text: failNode.text + "\n\n<span style='font-weight:bold; font-size:1.2em; color:red;'>（ステータスが大きく下がった！）</span>",
                choices: [
                    { text: "申し訳ありません。（言い直す）", next: lastSafeNodeId }
                ]
            };
            renderNode(currentDialogueNode);
            return;
        }
    }

    lastSafeNodeId = nodeId;
    registerStepForProgress(nodeId);
    updateStatusUI();
    currentDialogueNode = dialogueTree[nodeId];
    renderNode(currentDialogueNode);
    if (nodeId === 'step84_final_seal') startCelebration();
}

function renderNode(node) {
    currentActiveChoices = [];

    // Start Typewriter
    targetText = node.text;
    currentDisplayedText = "";
    dialogueText.innerHTML = ""; // Changed to innerHTML
    isTextComplete = false;
    textTimer = 0;

    const existingChoices = document.querySelectorAll('.choice-container');
    existingChoices.forEach(el => el.remove());

    if (node.choices && node.choices.length > 0) {
        const choiceContainer = document.createElement('div');
        choiceContainer.className = 'choice-container';
        currentActiveChoices = [...node.choices];
        // Shuffle if multiple
        if (currentActiveChoices.length > 1) {
            for (let i = currentActiveChoices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [currentActiveChoices[i], currentActiveChoices[j]] = [currentActiveChoices[j], currentActiveChoices[i]];
            }
        }
        currentActiveChoices.forEach(choice => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = choice.text;
            btn.onclick = () => {
                // 選択肢の効果を適用
                if (choice.effects) {
                    applyChoiceEffects(choice.effects);
                }
                showNode(choice.next);
            };
            choiceContainer.appendChild(btn);
        });
        dialogueBox.appendChild(choiceContainer);
        // selectedChoiceIndex = 0; // Removed initial selection
        // updateChoiceVisuals(); 
    }
}

function updateChoiceVisuals() {
    const buttons = document.querySelectorAll('.choice-btn');
    buttons.forEach((btn, index) => {
        if (index === selectedChoiceIndex) { btn.classList.add('selected'); } else { btn.classList.remove('selected'); }
    });
}

function closeDialogue() {
    isDialogueOpen = false; currentDialogueNode = null; dialogueBox.classList.add('hidden'); celebrationActive = false;
    const existingChoices = document.querySelectorAll('.choice-container'); existingChoices.forEach(el => el.remove());
}

const DISPLAY_SCALE = 1.0; // Global scale multiplier if needed

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save(); // Save context state
    if (shakeTimer > 0) {
        const dx = (Math.random() - 0.5) * shakeIntensity;
        const dy = (Math.random() - 0.5) * shakeIntensity;
        ctx.translate(dx, dy);
        shakeTimer--;
    }

    // --- Background Drawing (Aspect Fill / Cover) ---
    try {
        if (images.bg.complete && images.bg.naturalWidth > 0) {
            const bgRatio = images.bg.naturalWidth / images.bg.naturalHeight;
            const canvasRatio = canvas.width / canvas.height;

            let dw, dh, dx, dy;

            // "Cover" logic
            if (bgRatio > canvasRatio) {
                dh = canvas.height;
                dw = dh * bgRatio;
                dy = 0;
                dx = (canvas.width - dw) / 2;
            } else {
                dw = canvas.width;
                dh = dw / bgRatio;
                dx = 0;
                dy = (canvas.height - dh) / 2;
            }

            if (Number.isFinite(dx) && Number.isFinite(dy) && Number.isFinite(dw) && Number.isFinite(dh)) {
                ctx.drawImage(images.bg, dx, dy, dw, dh);
            }
        } else {
            // Fallback
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    } catch (e) {
        console.error("BG Draw Error:", e);
        ctx.fillStyle = '#f0f0f0'; // Fallback
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // --- Entity Drawing (Aspect Fit) ---
    const drawEntityScaled = (img, logicalX, logicalY, logicalW, logicalH) => {
        if (!img.complete || img.naturalWidth === 0) return;

        try {
            const targetHeight = 110;
            const ratio = img.naturalWidth / img.naturalHeight;
            const drawWidth = targetHeight * ratio;
            const drawHeight = targetHeight;

            const logicCenterX = logicalX + logicalW / 2;
            const logicBottomY = logicalY + logicalH;

            const drawX = logicCenterX - (drawWidth / 2);
            const drawY = logicBottomY - drawHeight;

            if (Number.isFinite(drawX) && Number.isFinite(drawY) && Number.isFinite(drawWidth) && Number.isFinite(drawHeight)) {
                ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
            }
        } catch (e) {
            console.error("Entity Draw Error:", e);
            // Fallback: draw placeholder box
            ctx.fillStyle = 'red';
            ctx.fillRect(logicalX, logicalY, logicalW, logicalH);
        }
    };

    const entities = [
        {
            type: 'receptionist', y: receptionist.y + receptionist.height,
            draw: () => drawEntityScaled(images.receptionist, receptionist.x, receptionist.y, receptionist.width, receptionist.height)
        },
        {
            type: 'player', y: player.y + player.height,
            draw: () => drawEntityScaled(images.player, player.x, player.y, player.width, player.height)
        }
    ];
    entities.sort((a, b) => a.y - b.y);
    entities.forEach(e => e.draw());

    if (celebrationActive) { try { updateCelebration(); drawCelebration(); } catch (e) { } }
    try { updateCutscene(); drawCutscene(); } catch (e) { }

    if (showEndScreen) {
        // Overlay
        if (endScreenType === 'game_over') {
            ctx.fillStyle = 'rgba(50, 0, 0, 0.9)'; // Dark Red
        } else {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        }
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Main Text
        ctx.save();
        if (endScreenType === 'game_over') {
            ctx.fillStyle = '#ff3333';
            ctx.font = 'bold 80px serif';
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 10;
            // Tremble effect
            ctx.translate((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5);
        } else {
            ctx.fillStyle = 'white';
            ctx.font = 'bold 60px sans-serif';
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(endScreenText, canvas.width / 2, canvas.height / 2 - 40);
        ctx.restore();

        // Sub Text or Button hint
        ctx.textAlign = 'center'; // Ensure center alignment
        ctx.fillStyle = '#cccccc';
        ctx.font = '20px sans-serif';
        ctx.fillText("Press SPACE or Tap to Restart", canvas.width / 2, canvas.height / 2 + 50);

        // Draw visual button for mobile/mouse
        ctx.fillStyle = 'white';
        ctx.fillRect(canvas.width / 2 - 80, canvas.height / 2 + 80, 160, 50);
        ctx.fillStyle = 'black';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText("RESTART", canvas.width / 2, canvas.height / 2 + 105); // Adjusted Y for centering
    }
    ctx.restore(); // Restore context state (undo shake)
}

// Debug
// Step番号ベースではなく、ノードIDベースでジャンプ（会話フローが変わっても壊れにくい）
window.jumpToNode = function (nodeId) {
    if (!nodeId) return;
    if (dialogueTree[nodeId]) {
        startDialogue(nodeId);
        return;
    }
    // 旧仕様の互換（数字のみ入力された場合）
    const n = parseInt(String(nodeId), 10);
    if (!Number.isNaN(n)) {
        if (n === 0) return startDialogue('step0_intro');
        const key = Object.keys(dialogueTree).find(k => k.startsWith(`step${n}_`));
        if (key) startDialogue(key);
    }
};



// ==========================================
// AUDIO SYSTEM (Web Audio API)
// ==========================================
let audioCtx = null;
let bgmOscillators = [];

function initAudio() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playTone(freq, type, duration, startTime = 0) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.value = freq;

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(audioCtx.currentTime + startTime);
    osc.stop(audioCtx.currentTime + startTime + duration);

    // Smooth envelope
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime + startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + startTime + duration);

    return osc;
}

function playIncorrectSound() {
    initAudio();
    // Low "Buzz" sound (Sawtooth, low pitch)
    // Play two short pulses
    playTone(150, 'sawtooth', 0.1, 0);
    playTone(120, 'sawtooth', 0.2, 0.15);
}

function playGameOverSound() {
    initAudio();
    stopBGM();

    // "Sad" Melody (Minor key arpeggio: A minor)
    // A3, C4, E4, A4 ... slow
    const now = audioCtx.currentTime;
    const notes = [
        { f: 220.00, d: 0.5, t: 0.0 }, // A3
        { f: 261.63, d: 0.5, t: 0.5 }, // C4
        { f: 311.13, d: 0.5, t: 1.0 }, // Eb4 (Diminished feel)
        { f: 220.00, d: 1.5, t: 1.5 }, // A3
    ];

    notes.forEach(n => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle'; // Softer than square/saw
        osc.frequency.value = n.f;
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now + n.t);
        osc.stop(now + n.t + n.d);

        gain.gain.setValueAtTime(0.1, now + n.t);
        gain.gain.linearRampToValueAtTime(0, now + n.t + n.d);

        bgmOscillators.push(osc);
    });
}

function playFanfare() {
    initAudio();
    stopBGM();

    // Fanfare (Major key: C Major)
    // C4, E4, G4, C5!
    const now = audioCtx.currentTime;
    const notes = [
        { f: 523.25, d: 0.1, t: 0.0 }, // C5
        { f: 523.25, d: 0.1, t: 0.15 }, // C5 (staccato)
        { f: 523.25, d: 0.1, t: 0.30 }, // C5
        { f: 659.25, d: 0.6, t: 0.45 }, // E5
        { f: 783.99, d: 0.6, t: 0.45 }, // G5 (Simulated chord)
        { f: 1046.50, d: 0.8, t: 0.45 }, // C6 (High note!)
    ];

    notes.forEach(n => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square'; // Brighter sound for fanfare
        osc.frequency.value = n.f;
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now + n.t);
        osc.stop(now + n.t + n.d);

        gain.gain.setValueAtTime(0.05, now + n.t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);

        bgmOscillators.push(osc);
    });
}

function stopBGM() {
    bgmOscillators.forEach(osc => {
        try { osc.stop(); } catch (e) { }
    });
    bgmOscillators = [];
}

