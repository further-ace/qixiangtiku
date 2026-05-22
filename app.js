/**
 * 气象题库练习系统 - 主应用逻辑
 */

const AUTH_CREDENTIALS = {
    '833081': { password: '280956w', role: 'admin' },
    '123': { password: 'qwe', role: 'user' }
};

const FeedbackStore = {
    _key: 'feedback_list',
    getAll() { return Store.get(this._key, []); },
    add(text, username) {
        const list = this.getAll();
        list.push({ text, username, time: new Date().toLocaleString('zh-CN') });
        Store.set(this._key, list);
    }
};

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

const AnalysisModule = {
    _key: 'custom_analysis',
    getAll() { return Store.get(this._key, {}); },
    get(id) { return this.getAll()[id] || ''; },
    set(id, text) {
        const a = this.getAll();
        if (text && text.trim() && text.trim() !== '无') {
            a[id] = text.trim();
        } else {
            delete a[id];
        }
        Store.set(this._key, a);
    },
    has(id) { return id in this.getAll(); }
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

function getQuestionDisplayNumber(questions, currentIndex) {
    const curType = questions[currentIndex].type;
    let num = 0;
    for (let i = 0; i <= currentIndex; i++) {
        if (questions[i].type === curType) num++;
    }
    return num;
}

function getTypeCount(questions, type) {
    return questions.filter(q => q.type === type).length;
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
            this._restoreCustomAnalysis();
            this._bindEvents();
            this._updateMarkCount();
            if (Store.get('logged_in')) {
                this._pageStack = ['home'];
                this.showPage('home');
                this._updateAdminBtn();
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
                if (bank === '错题收藏') {
                    this._showMarkChapters();
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
        document.getElementById('login-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.doLogin(); });
    },

    doLogin() {
        const user = document.getElementById('login-user').value.trim();
        const pass = document.getElementById('login-pass').value;
        const errEl = document.getElementById('login-error');
        const cred = AUTH_CREDENTIALS[user];
        if (cred && cred.password === pass) {
            Store.set('logged_in', true);
            Store.set('current_user', user);
            Store.set('current_role', cred.role);
            errEl.textContent = '';
            this._pageStack = ['home']; this.showPage('home');
            this._updateAdminBtn();
            if (!Store.get('has_logged_in_before_' + user)) {
                Store.set('has_logged_in_before_' + user, true);
                setTimeout(() => this._showWelcome(), 300);
            }
        } else { errEl.textContent = '用户名或密码错误'; }
    },

    _showWelcome() {
        showConfirm('欢迎您使用本系统，有任何意见或建议，可在右上角进行反馈，谢谢', () => {});
    },

    _updateAdminBtn() {
        const btn = document.getElementById('btn-admin');
        if (btn) btn.style.display = Store.get('current_role') === 'admin' ? 'block' : 'none';
    },

    doLogout() {
        showConfirm('确定退出登录？', () => {
            Store.remove('logged_in');
            Store.remove('current_user');
            Store.remove('current_role');
            document.getElementById('login-user').value = '';
            document.getElementById('login-pass').value = '';
            document.getElementById('login-error').textContent = '';
            this._pageStack = ['login']; this.showPage('login');
        });
    },

    _updateMarkCount() {
        const el = document.getElementById('wrong-count-label');
        if (el) el.textContent = `${WrongQuestionModule.getCount()}错 / ${FavoriteModule.getAll().length}藏`;
    },

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
        this._updateMarkCount();
    },

    // ---- 错题+收藏 章节分类 ----
    _showMarkChapters() {
        const wrongIds = WrongQuestionModule.getIds();
        const favIds = FavoriteModule.getAll();
        const allMarkIds = [...new Set([...wrongIds, ...favIds])];
        if (!allMarkIds.length) { showToast('暂无错题或收藏'); return; }

        const allMarkQs = allMarkIds.map(id => questionIndex[id]).filter(Boolean);
        const groups = {};
        allMarkQs.forEach(q => {
            const key = q.bank + ' / ' + q.chapter;
            if (!groups[key]) groups[key] = { bank: q.bank, chapter: q.chapter, ids: new Set() };
            groups[key].ids.add(q.id);
        });

        const listEl = document.getElementById('wrong-chapter-list');
        listEl.innerHTML = Object.values(groups).map(g => {
            const ids = [...g.ids];
            const wCnt = ids.filter(id => wrongIds.includes(id)).length;
            const fCnt = ids.filter(id => favIds.includes(id)).length;
            return `<div class="chapter-item" data-mark-bank="${g.bank}" data-mark-ch="${g.chapter}">
                <div>
                    <h3>${g.bank}</h3>
                    <div class="chapter-types">
                        <span class="type-tag">${g.chapter}</span>
                        ${wCnt ? `<span class="type-tag" style="background:#fce8e6;color:#ea4335;">${wCnt}错</span>` : ''}
                        ${fCnt ? `<span class="type-tag" style="background:#fff3e0;color:#e65100;">${fCnt}藏</span>` : ''}
                    </div>
                </div>
                <span class="chapter-count">${ids.length}题</span>
            </div>`;
        }).join('');

        listEl.querySelectorAll('.chapter-item').forEach(item => {
            item.addEventListener('click', () => {
                const bank = item.dataset.markBank;
                const ch = item.dataset.markCh;
                const qs = allMarkQs.filter(q => q.bank === bank && q.chapter === ch);
                this._startQuiz(shuffleArray(qs), `${ch} - 错题收藏`, false);
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
        } else if (mode === 'random-single') {
            const t = shuffleArray(getQuestionsByType(qs, '单选题'));
            if (!t.length) { showToast('无单选题'); return; }
            this._startQuiz(t, `${chapter} - 随机单选`, false);
        } else if (mode === 'random-multi') {
            const t = shuffleArray(getQuestionsByType(qs, '多选题'));
            if (!t.length) { showToast('无多选题'); return; }
            this._startQuiz(t, `${chapter} - 随机多选`, false);
        } else if (mode === 'random-judge') {
            const t = shuffleArray(getQuestionsByType(qs, '判断题'));
            if (!t.length) { showToast('无判断题'); return; }
            this._startQuiz(t, `${chapter} - 随机判断`, false);
        } else if (mode === 'random') {
            this._startQuiz(shuffleArray(qs), `${chapter} - 随机全部`, false);
        } else if (mode === 'wrong') {
            const wrongIds = WrongQuestionModule.getIds();
            const favIds = FavoriteModule.getAll();
            const allIds = [...new Set([...wrongIds, ...favIds])];
            const markQs = allIds.map(id => questionIndex[id]).filter(q => q && q.bank === bank && q.chapter === chapter);
            if (!markQs.length) { showToast('该章节暂无错题或收藏'); return; }
            this._startQuiz(shuffleArray(markQs), `${chapter} - 错题收藏`, false);
        } else if (mode === 'exam') {
            this._showExamConfig(qs);
        }
    },

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
        this._maxReachedIndex = 0;

        const progressKey = title;

        if (!isExam) {
            const saved = Store.get('quiz_progress_' + progressKey);
            if (saved && saved.index > 0 && saved.questionIds) {
                const savedIds = saved.questionIds;
                const curIds = questions.map(q => q.id);
                const match = savedIds.length === curIds.length && savedIds.every((id, i) => id === curIds[i]);
                if (match) {
                    this._showResumeDialog(progressKey, saved, questions, title, isExam, timeLimit);
                    return;
                }
            }
        }

        this._initQuizUI(title, isExam, timeLimit);
    },

    _showResumeDialog(progressKey, saved, questions, title, isExam, timeLimit) {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `<div class="confirm-dialog">
            <p>检测到上次答题进度（第${saved.index + 1}题/共${questions.length}题），是否继续？</p>
            <div class="confirm-btns">
                <button class="btn-cancel" id="resume-cancel">从头开始</button>
                <button class="btn-confirm" id="resume-confirm">继续答题</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#resume-cancel').addEventListener('click', () => {
            overlay.remove();
            Store.remove('quiz_progress_' + progressKey);
            this._initQuizUI(title, isExam, timeLimit);
        });
        overlay.querySelector('#resume-confirm').addEventListener('click', () => {
            overlay.remove();
            this._quizQuestions = questions;
            this._quizIndex = saved.index;
            this._userAnswers = saved.answers || {};
            this._multiConfirmed = saved.multiConfirmed || {};
            this._maxReachedIndex = saved.maxReached || saved.index;
            this._isExam = isExam;
            this._showAnswer = !isExam;
            this._initQuizUI(title, isExam, timeLimit);
        });
    },

    _initQuizUI(title, isExam, timeLimit) {
        document.getElementById('quiz-title').textContent = title;
        document.getElementById('btn-submit-exam').style.display = isExam ? 'block' : 'none';
        document.getElementById('btn-next').style.display = 'block';

        if (isExam && timeLimit > 0) {
            this._examTimeLeft = timeLimit;
            this._startExamTimer();
        } else {
            document.getElementById('exam-timer').style.display = 'none';
        }

        this._saveQuizProgress();
        this._renderQuestion();
        this.pushPage('quiz');
    },

    _saveQuizProgress() {
        if (this._isExam) return;
        const title = document.getElementById('quiz-title').textContent;
        const key = 'quiz_progress_' + title;
        Store.set(key, {
            index: this._quizIndex,
            questionIds: this._quizQuestions.map(q => q.id),
            answers: this._userAnswers,
            multiConfirmed: this._multiConfirmed,
            maxReached: this._maxReachedIndex
        });
    },

    _renderQuestion() {
        const q = this._quizQuestions[this._quizIndex];
        const curType = q.type;
        const typeNum = getQuestionDisplayNumber(this._quizQuestions, this._quizIndex);
        const typeTotal = getTypeCount(this._quizQuestions, curType);
        document.getElementById('quiz-progress').textContent = `${curType} ${typeNum}/${typeTotal}`;

        const badge = document.getElementById('question-type-badge');
        badge.textContent = `${curType} ${typeNum}`;
        badge.className = 'question-type';
        if (curType === '单选题') badge.classList.add('single');
        else if (curType === '多选题') badge.classList.add('multi');
        else if (curType === '判断题') badge.classList.add('judge');
        else badge.classList.add('fill');

        const isWrong = WrongQuestionModule.has(q.id);
        const isFav = FavoriteModule.has(q.id);

        let tagHtml = '';
        if (isWrong) tagHtml += '<span class="status-tag wrong-tag">错题</span>';
        if (isFav) tagHtml += '<span class="status-tag fav-tag">收藏</span>';
        const tagContainer = document.getElementById('status-tags');
        if (tagContainer) tagContainer.innerHTML = tagHtml;

        document.getElementById('question-text').textContent = q.content;

        const optionsEl = document.getElementById('options-list');
        const userAns = this._userAnswers[q.id];

        if (q.type === '判断题') {
            optionsEl.innerHTML = this._renderJudgeOptions(q, userAns);
        } else if (q.type === '填空题') {
            optionsEl.innerHTML = this._renderFillOptions(q, userAns);
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

        if (showResult) {
            html += `<div class="answer-explanation">正确答案：${q.answer}</div>`;
            html += this._renderAnalysis(q);
        }
        return html;
    },

    _renderFillOptions(q, userAns) {
        const showResult = this._showAnswer && userAns !== undefined && userAns !== null && userAns !== '';
        let html = q.options.map(opt => {
            let cls = 'option-item';
            const isSelected = userAns === opt.label;
            if (isSelected && !showResult) cls += ' selected';
            return `<div class="${cls}" data-label="${opt.label}" onclick="App.selectOption('${opt.label}')">
                <span class="option-label">${opt.label}</span>
                <span class="option-content">${opt.content}</span>
            </div>`;
        }).join('');
        if (showResult) {
            html += `<div class="answer-explanation">正确答案：${q.answer}</div>`;
            html += this._renderAnalysis(q);
        }
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
        if (showResult) {
            html += `<div class="answer-explanation">正确答案：${correct}</div>`;
            html += this._renderAnalysis(q);
        }
        return html;
    },

    _renderAnalysis(q) {
        const customAnalysis = AnalysisModule.get(q.id);
        const analysisText = customAnalysis || ((q.analysis && q.analysis.trim() && q.analysis !== '无') ? q.analysis : '无');
        return `<div class="question-analysis">
            <span class="analysis-text">解析：${analysisText}</span>
            <button class="analysis-edit-btn" onclick="App._toggleAnalysisEdit(${q.id})" title="编辑解析">✎</button>
        </div>
        <div class="analysis-edit-area" id="analysis-edit-${q.id}" style="display:none;">
            <textarea id="analysis-input-${q.id}" class="analysis-input">${customAnalysis || (q.analysis && q.analysis.trim() && q.analysis !== '无' ? q.analysis : '')}</textarea>
            <div class="analysis-edit-actions">
                <button class="analysis-save-btn" onclick="App._saveAnalysis(${q.id})">保存</button>
                <button class="analysis-cancel-btn" onclick="App._cancelAnalysisEdit(${q.id})">取消</button>
            </div>
        </div>`;
    },

    _toggleAnalysisEdit(qId) {
        const editArea = document.getElementById(`analysis-edit-${qId}`);
        if (editArea) {
            editArea.style.display = editArea.style.display === 'none' ? 'block' : 'none';
        }
    },

    _saveAnalysis(qId) {
        const input = document.getElementById(`analysis-input-${qId}`);
        if (!input) return;
        const text = input.value.trim();
        AnalysisModule.set(qId, text);
        const q = questionIndex[qId];
        if (q) q.analysis = text || '无';
        showToast('解析已保存');
        this._renderQuestion();
    },

    _cancelAnalysisEdit(qId) {
        const editArea = document.getElementById(`analysis-edit-${qId}`);
        if (editArea) editArea.style.display = 'none';
    },

    _restoreCustomAnalysis() {
        const customAnalysis = AnalysisModule.getAll();
        for (const id in customAnalysis) {
            const q = questionIndex[id];
            if (q) q.analysis = customAnalysis[id];
        }
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

        this._saveQuizProgress();
        this._renderQuestion();
    },

    confirmMulti() {
        const q = this._quizQuestions[this._quizIndex];
        const userAns = this._userAnswers[q.id];
        if (!userAns || userAns.length === 0) { showToast('请至少选择一个选项'); return; }
        this._multiConfirmed[q.id] = true;
        this._checkAnswer(q);
        this._saveQuizProgress();
        this._renderQuestion();
    },

    _updateMultiConfirmBtn() {
        const q = this._quizQuestions[this._quizIndex];
        const isMulti = q.type === '多选题';
        const confirmed = this._multiConfirmed[q.id];
        const btn = document.getElementById('btn-confirm-multi');
        btn.style.display = (isMulti && !confirmed && !this._isExam) ? 'block' : 'none';
    },

    selectJudge(val) {
        const q = this._quizQuestions[this._quizIndex];
        if (this._isExam && this._userAnswers[q.id] !== undefined) return;
        this._userAnswers[q.id] = val;
        this._checkAnswer(q);
        this._saveQuizProgress();
        this._renderQuestion();
    },

    _checkAnswer(q) {
        const userAns = this._userAnswers[q.id];
        if (userAns === undefined || userAns === null || userAns === '') return;
        const isCorrect = this._isAnswerCorrect(q, userAns);
        if (!isCorrect) {
            WrongQuestionModule.add(q.id, userAns, q.answer);
        }
        // 做对不再自动移除错题，需用户手动删除
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

    prevQuestion() {
        if (this._quizIndex > 0) {
            this._quizIndex--;
            const q = this._quizQuestions[this._quizIndex];
            if (!this._isExam && this._userAnswers[q.id] !== undefined) {
                delete this._userAnswers[q.id];
                delete this._multiConfirmed[q.id];
            }
            this._saveQuizProgress();
            this._renderQuestion();
        }
    },

    nextQuestion() {
        if (this._quizIndex < this._quizQuestions.length - 1) {
            this._quizIndex++;
            if (this._quizIndex > this._maxReachedIndex) {
                this._maxReachedIndex = this._quizIndex;
            }
            this._saveQuizProgress();
            this._renderQuestion();
        }
        else if (!this._isExam) { this._showResult(); }
    },

    _startExamTimer() {
        const el = document.getElementById('exam-timer');
        el.style.display = 'block'; el.classList.remove('warning');
        this._updateTimerDisplay();
        this._examTimer = setInterval(() => {
            this._examTimeLeft--; this._updateTimerDisplay();
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

    _showResult() {
        const title = document.getElementById('quiz-title').textContent;
        Store.remove('quiz_progress_' + title);

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

    // ---- 答题卡（按题型分组，独立编号） ----
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
            indices.forEach((qi, seqNum) => {
                const q = this._quizQuestions[qi];
                const userAns = this._userAnswers[q.id];
                const isAnswered = userAns !== undefined && userAns !== null && userAns !== '';
                const isCorrect = isAnswered && this._isAnswerCorrect(q, userAns);
                const isWrong = isAnswered && !this._isAnswerCorrect(q, userAns);
                const isCurrent = qi === this._quizIndex;

                let cls = 'sheet-item';
                if (this._showAnswer && isCorrect) cls += ' correct';
                else if (this._showAnswer && isWrong) cls += ' wrong';
                else if (isAnswered) cls += ' answered';
                if (isCurrent) cls += ' current';

                html += `<div class="${cls}" onclick="App.jumpToQuestion(${qi})">${seqNum + 1}</div>`;
            });
            html += '</div>';
        });

        container.innerHTML = html;
        document.getElementById('answer-sheet-overlay').classList.add('visible');
    },

    closeAnswerSheet() { document.getElementById('answer-sheet-overlay').classList.remove('visible'); },
    jumpToQuestion(index) {
        this._quizIndex = index;
        if (!this._isExam) {
            const q = this._quizQuestions[this._quizIndex];
            if (this._userAnswers[q.id] !== undefined && index < this._maxReachedIndex) {
                delete this._userAnswers[q.id];
                delete this._multiConfirmed[q.id];
            }
            if (index > this._maxReachedIndex) this._maxReachedIndex = index;
            this._saveQuizProgress();
        }
        this._renderQuestion();
        this.closeAnswerSheet();
    },

    // ---- 收藏（改为：收藏=加入标记，取消收藏=从收藏移除；若同时是错题则仍保留在错题本） ----
    toggleFavorite() {
        const q = this._quizQuestions[this._quizIndex];
        showToast(FavoriteModule.toggle(q.id) ? '已收藏' : '取消收藏');
        this._updateFavIcon();
        this._updateMarkCount();
    },

    // ---- 删除错题（手动） ----
    deleteWrong() {
        const q = this._quizQuestions[this._quizIndex];
        if (!WrongQuestionModule.has(q.id)) { showToast('该题不是错题'); return; }
        showConfirm('确定从错题本删除此题？', () => {
            WrongQuestionModule.remove(q.id);
            showToast('已删除');
            this._renderQuestion();
            this._updateMarkCount();
        });
    },

    _updateFavIcon() {
        const q = this._quizQuestions[this._quizIndex];
        const icon = document.getElementById('fav-icon');
        if (icon) icon.textContent = FavoriteModule.has(q.id) ? '★' : '☆';
    },

    openFeedback() {
        document.getElementById('feedback-text').value = '';
        document.getElementById('feedback-overlay').classList.add('visible');
    },

    closeFeedback() {
        document.getElementById('feedback-overlay').classList.remove('visible');
    },

    submitFeedback() {
        const text = document.getElementById('feedback-text').value.trim();
        if (!text) { showToast('请输入反馈内容'); return; }
        const user = Store.get('current_user') || '匿名';
        FeedbackStore.add(text, user);
        showToast('反馈提交成功，谢谢！');
        this.closeFeedback();
    },

    openAdminPanel() {
        const list = FeedbackStore.getAll();
        const panel = document.getElementById('admin-panel');
        const listEl = document.getElementById('admin-feedback-list');
        if (!list.length) {
            listEl.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">暂无反馈意见</p>';
        } else {
            listEl.innerHTML = list.map((fb, i) =>
                `<div class="admin-feedback-item">
                    <div class="admin-feedback-meta">用户：${fb.username} | 时间：${fb.time}</div>
                    <div class="admin-feedback-text">${fb.text}</div>
                </div>`
            ).reverse().join('');
        }
        document.getElementById('admin-overlay').classList.add('visible');
    },

    closeAdminPanel() {
        document.getElementById('admin-overlay').classList.remove('visible');
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
