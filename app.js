/**
 * 气象题库练习系统 - 主应用逻辑
 */

const AUTH_CREDENTIALS = { username: '833081', password: '280956w' };

const Store = {
    _prefix: 'meteo_quiz_',
    get(key, defaultVal = null) {
        try { const r = localStorage.getItem(this._prefix + key); return r ? JSON.parse(r) : defaultVal; }
        catch { return defaultVal; }
    },
    set(key, value) {
        try { localStorage.setItem(this._prefix + key, JSON.stringify(value)); } catch (e) { console.warn(e); }
    },
    remove(key) { localStorage.removeItem(this._prefix + key); }
};

const WrongQuestionModule = {
    _key: 'wrong_questions',
    getAll() { return Store.get(this._key, {}); },
    add(id, userAns, correctAns) {
        const w = this.getAll();
        w[id] = { userAns, correctAns, timestamp: Date.now(), count: (w[id]?.count || 0) + 1 };
        Store.set(this._key, w);
    },
    remove(id) { const w = this.getAll(); delete w[id]; Store.set(this._key, w); },
    has(id) { return id in this.getAll(); },
    getIds() { return Object.keys(this.getAll()).map(Number); },
    getCount() { return Object.keys(this.getAll()).length; },
    clear() { Store.set(this._key, {}); }
};

const FavoriteModule = {
    _key: 'favorites',
    getAll() { return Store.get(this._key, []); },
    toggle(id) {
        const f = this.getAll(); const i = f.indexOf(id);
        if (i === -1) f.push(id); else f.splice(i, 1);
        Store.set(this._key, f); return i === -1;
    },
    has(id) { return this.getAll().includes(id); }
};

let allQuestions = [];
let questionIndex = {};

function buildIndex() { questionIndex = {}; allQuestions.forEach(q => { questionIndex[q.id] = q; }); }
function getQuestionsByBank(bank) { return allQuestions.filter(q => q.bank === bank); }
function getQuestionsByChapter(bank, ch) { return allQuestions.filter(q => q.bank === bank && q.chapter === ch); }
function getQuestionsByType(qs, type) { return qs.filter(q => q.type === type); }
function shuffleArray(arr) {
    const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a;
}

const App = {
    _pageStack: ['login'],
    _currentBank: null,
    _currentChapter: null,
    _currentMode: null,
    _quizQuestions: [],
    _quizIndex: 0,
    _userAnswers: {},
    _isExam: false,
    _examTimer: null,
    _examTimeLeft: 0,
    _showAnswer: false,
    _multiConfirmed: {},

    async init() {
        showLoading(true);
        try {
            const resp = await fetch('questions.json');
            allQuestions = await resp.json();
            buildIndex();
            this._bindEvents();
            this._updateWrongCount();
            if (Store.get('logged_in')) {
                this._pageStack = ['home'];
                this.showPage('home');
            } else {
                this._pageStack = ['login'];
                this.showPage('login');
            }
        } catch (e) {
            console.error('加载题库失败:', e);
            showToast('题库加载失败');
        } finally {
            showLoading(false);
        }
    },

    _bindEvents() {
        document.querySelectorAll('.bank-card').forEach(card => {
            card.addEventListener('click', () => {
                const bank = card.dataset.bank;
                if (bank === '错题本') {
                    this._showWrongChapters();
                } else {
                    this._currentBank = bank;
                    this._showChapterPage(bank);
                }
            });
        });

        document.querySelectorAll('.mode-card').forEach(card => {
            card.addEventListener('click', () => {
                this._currentMode = card.dataset.mode;
                this._handleModeSelect();
            });
        });

        document.getElementById('btn-start-exam').addEventListener('click', () => this._startExam());
        document.getElementById('exam-single').addEventListener('input', () => this._updateExamInfo());
        document.getElementById('exam-multi').addEventListener('input', () => this._updateExamInfo());
        document.getElementById('exam-judge').addEventListener('input', () => this._updateExamInfo());

        document.getElementById('login-pass').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.doLogin();
        });
    },

    // ---- 登录 ----
    doLogin() {
        const user = document.getElementById('login-user').value.trim();
        const pass = document.getElementById('login-pass').value;
        const errEl = document.getElementById('login-error');
        if (user === AUTH_CREDENTIALS.username && pass === AUTH_CREDENTIALS.password) {
            Store.set('logged_in', true);
            errEl.textContent = '';
            this._pageStack = ['home'];
            this.showPage('home');
        } else {
            errEl.textContent = '用户名或密码错误';
        }
    },

    doLogout() {
        showConfirm('确定退出登录？', () => {
            Store.remove('logged_in');
            document.getElementById('login-user').value = '';
            document.getElementById('login-pass').value = '';
            document.getElementById('login-error').textContent = '';
            this._pageStack = ['login'];
            this.showPage('login');
        });
    },

    // ---- 错题统计 ----
    _updateWrongCount() {
        const el = document.getElementById('wrong-count-label');
        if (el) el.textContent = WrongQuestionModule.getCount() + '道错题';
    },

    // ---- 页面导航 ----
    showPage(pageId) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const page = document.getElementById('page-' + pageId);
        if (page) page.classList.add('active');
        document.getElementById('quiz-footer').classList.toggle('visible', pageId === 'quiz');
    },

    pushPage(pageId) { this._pageStack.push(pageId); this.showPage(pageId); },

    goBack() {
        if (this._pageStack.length > 1) {
            this._pageStack.pop();
            this.showPage(this._pageStack[this._pageStack.length - 1]);
        }
        if (this._pageStack.length === 1) this.goHome();
    },

    goHome() {
        this._stopExamTimer();
        this._pageStack = ['home'];
        this.showPage('home');
        this._updateWrongCount();
    },

    // ---- 错题本章节分类 ----
    _showWrongChapters() {
        const wrongIds = WrongQuestionModule.getIds();
        if (wrongIds.length === 0) { showToast('暂无错题'); return; }

        const wrongQs = wrongIds.map(id => questionIndex[id]).filter(Boolean);
        const groups = {};
        wrongQs.forEach(q => {
            const key = q.bank + ' / ' + q.chapter;
            if (!groups[key]) groups[key] = { bank: q.bank, chapter: q.chapter, questions: [] };
            groups[key].questions.push(q);
        });

        const listEl = document.getElementById('wrong-chapter-list');
        listEl.innerHTML = Object.values(groups).map(g => `
            <div class="chapter-item" data-wrong-bank="${g.bank}" data-wrong-ch="${g.chapter}">
                <div>
                    <h3>${g.bank}</h3>
                    <div class="chapter-types"><span class="type-tag">${g.chapter}</span></div>
                </div>
                <span class="chapter-count">${g.questions.length}道错题</span>
            </div>`).join('');

        listEl.querySelectorAll('.chapter-item').forEach(item => {
            item.addEventListener('click', () => {
                const bank = item.dataset.wrongBank;
                const ch = item.dataset.wrongCh;
                const qs = wrongQs.filter(q => q.bank === bank && q.chapter === ch);
                this._startQuiz(shuffleArray(qs), `${ch} - 错题练习`, false);
            });
        });

        this.pushPage('wrong-chapters');
    },

    // ---- 章节选择 ----
    _showChapterPage(bank) {
        const chapters = [...new Set(getQuestionsByBank(bank).map(q => q.chapter))];
        const listEl = document.getElementById('chapter-list');
        document.getElementById('chapter-title').textContent = bank;

        listEl.innerHTML = chapters.map(ch => {
            const qs = getQuestionsByChapter(bank, ch);
            const s = getQuestionsByType(qs, '单选题').length;
            const m = getQuestionsByType(qs, '多选题').length;
            const j = getQuestionsByType(qs, '判断题').length;
            return `<div class="chapter-item" data-chapter="${ch}">
                <div>
                    <h3>${ch}</h3>
                    <div class="chapter-types">
                        ${s ? `<span class="type-tag">单选${s}</span>` : ''}
                        ${m ? `<span class="type-tag">多选${m}</span>` : ''}
                        ${j ? `<span class="type-tag">判断${j}</span>` : ''}
                    </div>
                </div>
                <span class="chapter-count">共${qs.length}题</span>
            </div>`;
        }).join('');

        listEl.querySelectorAll('.chapter-item').forEach(item => {
            item.addEventListener('click', () => {
                this._currentChapter = item.dataset.chapter;
                this._showModePage();
            });
        });

        this.pushPage('chapter');
    },

    _showModePage() {
        document.getElementById('mode-title').textContent = this._currentChapter;
        this.pushPage('mode');
    },

    _handleModeSelect() {
        const mode = this._currentMode;
        const bank = this._currentBank;
        const chapter = this._currentChapter;
        const qs = getQuestionsByChapter(bank, chapter);

        if (mode === 'chapter-all') {
            const ordered = [...getQuestionsByType(qs, '单选题'), ...getQuestionsByType(qs, '多选题'), ...getQuestionsByType(qs, '判断题')];
            this._startQuiz(ordered, `${chapter} - 全部`, false);
        } else if (mode === 'chapter-single') {
            const t = getQuestionsByType(qs, '单选题');
            if (!t.length) { showToast('无单选题'); return; }
            this._startQuiz([...t], `${chapter} - 单选题`, false);
        } else if (mode === 'chapter-multi') {
            const t = getQuestionsByType(qs, '多选题');
            if (!t.length) { showToast('无多选题'); return; }
            this._startQuiz([...t], `${chapter} - 多选题`, false);
        } else if (mode === 'chapter-judge') {
            const t = getQuestionsByType(qs, '判断题');
            if (!t.length) { showToast('无判断题'); return; }
            this._startQuiz([...t], `${chapter} - 判断题`, false);
        } else if (mode === 'random') {
            this._startQuiz(shuffleArray(qs), `${chapter} - 随机练习`, false);
        } else if (mode === 'wrong') {
            const wrongIds = WrongQuestionModule.getIds();
            const wrongQs = wrongIds.map(id => questionIndex[id]).filter(q => q && q.bank === bank && q.chapter === chapter);
            if (!wrongQs.length) { showToast('该章节暂无错题'); return; }
            this._startQuiz(shuffleArray(wrongQs), `${chapter} - 错题练习`, false);
        } else if (mode === 'exam') {
            this._showExamConfig(qs);
        }
    },

    // ---- 考试配置 ----
    _showExamConfig(qs) {
        document.getElementById('exam-single').max = getQuestionsByType(qs, '单选题').length;
        document.getElementById('exam-multi').max = getQuestionsByType(qs, '多选题').length;
        document.getElementById('exam-judge').max = getQuestionsByType(qs, '判断题').length;
        document.getElementById('exam-single').value = Math.min(30, getQuestionsByType(qs, '单选题').length);
        document.getElementById('exam-multi').value = Math.min(10, getQuestionsByType(qs, '多选题').length);
        document.getElementById('exam-judge').value = Math.min(20, getQuestionsByType(qs, '判断题').length);
        this._updateExamInfo();
        this.pushPage('exam-config');
    },

    _updateExamInfo() {
        const qs = getQuestionsByChapter(this._currentBank, this._currentChapter);
        document.getElementById('exam-available').textContent =
            `可用：单选${getQuestionsByType(qs, '单选题').length} / 多选${getQuestionsByType(qs, '多选题').length} / 判断${getQuestionsByType(qs, '判断题').length}`;
    },

    _startExam() {
        const qs = getQuestionsByChapter(this._currentBank, this._currentChapter);
        const sN = parseInt(document.getElementById('exam-single').value) || 0;
        const mN = parseInt(document.getElementById('exam-multi').value) || 0;
        const jN = parseInt(document.getElementById('exam-judge').value) || 0;
        const examQs = [
            ...shuffleArray(getQuestionsByType(qs, '单选题')).slice(0, sN),
            ...shuffleArray(getQuestionsByType(qs, '多选题')).slice(0, mN),
            ...shuffleArray(getQuestionsByType(qs, '判断题')).slice(0, jN)
        ];
        if (!examQs.length) { showToast('请至少选择1道题目'); return; }
        this._startQuiz(examQs, `${this._currentChapter} - 考试`, true, parseInt(document.getElementById('exam-time').value) * 60);
    },

    // ---- 核心答题 ----
    _startQuiz(questions, title, isExam, timeLimit = 0) {
        this._quizQuestions = questions;
        this._quizIndex = 0;
        this._userAnswers = {};
        this._multiConfirmed = {};
        this._isExam = isExam;
        this._showAnswer = !isExam;

        document.getElementById('quiz-title').textContent = title;
        document.getElementById('btn-submit-exam').style.display = isExam ? 'block' : 'none';
        document.getElementById('btn-next').style.display = 'block';

        if (isExam && timeLimit > 0) {
            this._examTimeLeft = timeLimit;
            this._startExamTimer();
        } else {
            document.getElementById('exam-timer').style.display = 'none';
        }

        this._renderQuestion();
        this.pushPage('quiz');
    },

    _renderQuestion() {
        const q = this._quizQuestions[this._quizIndex];
        document.getElementById('quiz-progress').textContent = `${this._quizIndex + 1}/${this._quizQuestions.length}`;

        const badge = document.getElementById('question-type-badge');
        badge.textContent = q.type;
        badge.className = 'question-type';
        if (q.type === '单选题') badge.classList.add('single');
        else if (q.type === '多选题') badge.classList.add('multi');
        else badge.classList.add('judge');

        document.getElementById('question-text').textContent = q.content;

        const optionsEl = document.getElementById('options-list');
        const userAns = this._userAnswers[q.id];

        if (q.type === '判断题') {
            optionsEl.innerHTML = this._renderJudgeOptions(q, userAns);
        } else {
            optionsEl.innerHTML = this._renderChoiceOptions(q, userAns);
        }

        this._updateNavButtons();
        this._updateFavIcon();
        this._updateMultiConfirmBtn();
    },

    _renderChoiceOptions(q, userAns) {
        const isMulti = q.type === '多选题';
        const confirmed = this._multiConfirmed[q.id];
        const showResult = this._showAnswer && (isMulti ? confirmed : (userAns !== undefined && userAns !== null && userAns !== ''));

        let html = q.options.map(opt => {
            let cls = 'option-item';
            const isSelected = userAns && userAns.includes(opt.label);
            const isCorrectOpt = q.answer.includes(opt.label);

            if (showResult) {
                if (isCorrectOpt) cls += ' correct';
                else if (isSelected && !isCorrectOpt) cls += ' wrong';
            } else if (isSelected) {
                cls += ' selected';
            }

            return `<div class="${cls}" data-label="${opt.label}" onclick="App.selectOption('${opt.label}')">
                <span class="option-label">${opt.label}</span>
                <span class="option-content">${opt.content}</span>
            </div>`;
        }).join('');

        if (showResult) html += `<div class="answer-explanation">正确答案：${q.answer}</div>`;
        return html;
    },

    _renderJudgeOptions(q, userAns) {
        const showResult = this._showAnswer && userAns !== undefined && userAns !== null;
        const correct = q.answer;

        const renderBtn = (val) => {
            let cls = 'judge-option';
            if (showResult) {
                if (val === correct) cls += ' correct';
                else if (val === userAns && val !== correct) cls += ' wrong';
            } else if (userAns === val) {
                cls += ' selected';
            }
            return `<div class="${cls}" onclick="App.selectJudge('${val}')">${val}</div>`;
        };

        let html = `<div class="judge-options">${renderBtn('对')}${renderBtn('错')}</div>`;
        if (showResult) html += `<div class="answer-explanation">正确答案：${correct}</div>`;
        return html;
    },

    selectOption(label) {
        const q = this._quizQuestions[this._quizIndex];
        if (this._isExam && this._userAnswers[q.id] !== undefined) return;
        if (this._multiConfirmed[q.id]) return;

        let current = this._userAnswers[q.id] || '';

        if (q.type === '单选题') {
            this._userAnswers[q.id] = label;
            this._checkAnswer(q);
        } else {
            if (current.includes(label)) current = current.replace(label, '');
            else current += label;
            this._userAnswers[q.id] = current.split('').sort().join('');
        }

        this._renderQuestion();
    },

    confirmMulti() {
        const q = this._quizQuestions[this._quizIndex];
        const userAns = this._userAnswers[q.id];
        if (!userAns || userAns.length === 0) { showToast('请至少选择一个选项'); return; }
        this._multiConfirmed[q.id] = true;
        this._checkAnswer(q);
        this._renderQuestion();
    },

    _updateMultiConfirmBtn() {
        const q = this._quizQuestions[this._quizIndex];
        const isMulti = q.type === '多选题';
        const confirmed = this._multiConfirmed[q.id];
        const btn = document.getElementById('btn-confirm-multi');

        if (isMulti && !confirmed && !this._isExam) {
            btn.style.display = 'block';
        } else {
            btn.style.display = 'none';
        }
    },

    selectJudge(val) {
        const q = this._quizQuestions[this._quizIndex];
        if (this._isExam && this._userAnswers[q.id] !== undefined) return;
        this._userAnswers[q.id] = val;
        this._checkAnswer(q);
        this._renderQuestion();
    },

    _checkAnswer(q) {
        const userAns = this._userAnswers[q.id];
        if (userAns === undefined || userAns === null || userAns === '') return;
        const isCorrect = this._isAnswerCorrect(q, userAns);
        if (!isCorrect) WrongQuestionModule.add(q.id, userAns, q.answer);
        else if (WrongQuestionModule.has(q.id)) WrongQuestionModule.remove(q.id);
    },

    _isAnswerCorrect(q, userAns) {
        if (q.type === '判断题') return userAns === q.answer;
        return userAns.split('').sort().join('') === q.answer.split('').sort().join('');
    },

    _updateNavButtons() {
        document.getElementById('btn-prev').disabled = this._quizIndex === 0;
        const isLast = this._quizIndex === this._quizQuestions.length - 1;
        document.getElementById('btn-next').textContent = (!this._isExam && isLast) ? '查看结果' : '下一题';
    },

    prevQuestion() { if (this._quizIndex > 0) { this._quizIndex--; this._renderQuestion(); } },

    nextQuestion() {
        if (this._quizIndex < this._quizQuestions.length - 1) { this._quizIndex++; this._renderQuestion(); }
        else if (!this._isExam) { this._showResult(); }
    },

    // ---- 考试计时 ----
    _startExamTimer() {
        const el = document.getElementById('exam-timer');
        el.style.display = 'block';
        el.classList.remove('warning');
        this._updateTimerDisplay();
        this._examTimer = setInterval(() => {
            this._examTimeLeft--;
            this._updateTimerDisplay();
            if (this._examTimeLeft <= 300) el.classList.add('warning');
            if (this._examTimeLeft <= 0) this.submitExam();
        }, 1000);
    },

    _stopExamTimer() {
        if (this._examTimer) { clearInterval(this._examTimer); this._examTimer = null; }
        document.getElementById('exam-timer').style.display = 'none';
        document.getElementById('exam-timer').classList.remove('warning');
    },

    _updateTimerDisplay() {
        const m = Math.floor(this._examTimeLeft / 60), s = this._examTimeLeft % 60;
        document.getElementById('timer-display').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    },

    submitExam() { this._stopExamTimer(); this._showAnswer = true; this._isExam = false; this._renderQuestion(); this._showResult(); },

    confirmQuit() {
        if (this._isExam) showConfirm('确定要交卷退出吗？', () => this.submitExam());
        else this.goBack();
    },

    // ---- 结果 ----
    _showResult() {
        let correct = 0, wrong = 0, unanswered = 0;
        this._quizQuestions.forEach(q => {
            const a = this._userAnswers[q.id];
            if (a === undefined || a === null || a === '') unanswered++;
            else if (this._isAnswerCorrect(q, a)) correct++;
            else wrong++;
        });
        const total = this._quizQuestions.length;
        document.getElementById('score-number').textContent = total > 0 ? Math.round((correct / total) * 100) : 0;
        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-correct').textContent = correct;
        document.getElementById('stat-wrong').textContent = wrong;
        document.getElementById('stat-unanswered').textContent = unanswered;
        this._stopExamTimer();
        this.pushPage('result');
    },

    viewWrongQuestions() {
        const ids = WrongQuestionModule.getIds();
        const qs = ids.map(id => questionIndex[id]).filter(Boolean);
        if (!qs.length) { showToast('没有错题'); this.goHome(); return; }
        this._pageStack = ['home'];
        this._startQuiz(shuffleArray(qs), '错题重练', false);
    },

    // ---- 答题卡（按题型分组） ----
    openAnswerSheet() {
        const container = document.getElementById('sheet-groups');
        const typeOrder = ['单选题', '多选题', '判断题'];

        let html = '';
        typeOrder.forEach(type => {
            const indices = [];
            this._quizQuestions.forEach((q, i) => { if (q.type === type) indices.push(i); });
            if (!indices.length) return;

            html += `<div class="sheet-group-title">${type}（${indices.length}题）</div>`;
            html += '<div class="sheet-grid">';
            indices.forEach(i => {
                const q = this._quizQuestions[i];
                const userAns = this._userAnswers[q.id];
                const isAnswered = userAns !== undefined && userAns !== null && userAns !== '';
                const isCorrect = isAnswered && this._isAnswerCorrect(q, userAns);
                const isWrong = isAnswered && !this._isAnswerCorrect(q, userAns);
                const isCurrent = i === this._quizIndex;

                let cls = 'sheet-item';
                if (this._showAnswer && isCorrect) cls += ' correct';
                else if (this._showAnswer && isWrong) cls += ' wrong';
                else if (isAnswered) cls += ' answered';
                if (isCurrent) cls += ' current';

                html += `<div class="${cls}" onclick="App.jumpToQuestion(${i})">${i + 1}</div>`;
            });
            html += '</div>';
        });

        container.innerHTML = html;
        document.getElementById('answer-sheet-overlay').classList.add('visible');
    },

    closeAnswerSheet() { document.getElementById('answer-sheet-overlay').classList.remove('visible'); },

    jumpToQuestion(index) { this._quizIndex = index; this._renderQuestion(); this.closeAnswerSheet(); },

    // ---- 收藏 ----
    toggleFavorite() {
        const q = this._quizQuestions[this._quizIndex];
        showToast(FavoriteModule.toggle(q.id) ? '已收藏' : '取消收藏');
        this._updateFavIcon();
    },

    _updateFavIcon() {
        const q = this._quizQuestions[this._quizIndex];
        const icon = document.getElementById('fav-icon');
        if (icon) icon.textContent = FavoriteModule.has(q.id) ? '★' : '☆';
    }
};

function showLoading(show) { document.getElementById('loading-overlay').classList.toggle('hidden', !show); }

function showToast(msg, duration = 2000) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('visible');
    setTimeout(() => t.classList.remove('visible'), duration);
}

function showConfirm(msg, onConfirm) {
    const o = document.createElement('div');
    o.className = 'confirm-overlay';
    o.innerHTML = `<div class="confirm-dialog"><p>${msg}</p><div class="confirm-btns"><button class="btn-cancel" onclick="this.closest('.confirm-overlay').remove()">取消</button><button class="btn-confirm">确定</button></div></div>`;
    document.body.appendChild(o);
    o.querySelector('.btn-confirm').addEventListener('click', () => { o.remove(); onConfirm(); });
}

document.addEventListener('DOMContentLoaded', () => App.init());
