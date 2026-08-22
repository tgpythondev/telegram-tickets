document.addEventListener('DOMContentLoaded', () => {
    // ── Auth check: refresh cookie, update UI ──
    let loggedInUser = null;

    async function checkAuthOnIndex() {
        try {
            const user = await checkAuth();
            if (user && user.username) {
                loggedInUser = user;
                updateUIforLoggedInUser();
                return;
            }
        } catch (_) {
            // Not logged in
        }
        // Not logged in — leave default state
        const authBtn = document.getElementById('nav-auth-btn');
        const usernameEl = document.getElementById('nav-username');
        if (authBtn) {
            authBtn.textContent = typeof t === 'function' ? t('nav_login') : 'Войти';
            authBtn.href = 'auth.html';
            authBtn.classList.remove('nav-ticket-btn');
            authBtn.classList.add('nav-cta');
        }
        if (usernameEl) {
            usernameEl.style.display = 'none';
        }
    }

    function updateUIforLoggedInUser() {
        if (!loggedInUser) return;
        const authBtn = document.getElementById('nav-auth-btn');
        const usernameEl = document.getElementById('nav-username');
        if (authBtn) {
            authBtn.textContent = typeof t === 'function' ? t('nav_account') : 'Личный кабинет';
            authBtn.href = 'account.html';
            authBtn.classList.remove('nav-cta');
            authBtn.classList.add('nav-ticket-btn');
        }
        if (usernameEl) {
            usernameEl.textContent = loggedInUser.username;
            usernameEl.style.display = 'inline';
        }
    }

    // Listen for language changes to re-apply auth UI
    window.addEventListener('langchange', () => {
        if (loggedInUser) {
            updateUIforLoggedInUser();
        } else {
            const authBtn = document.getElementById('nav-auth-btn');
            const usernameEl = document.getElementById('nav-username');
            if (authBtn) {
                authBtn.textContent = typeof t === 'function' ? t('nav_login') : 'Войти';
                authBtn.href = 'auth.html';
                authBtn.classList.remove('nav-ticket-btn');
                authBtn.classList.add('nav-cta');
            }
            if (usernameEl) {
                usernameEl.style.display = 'none';
            }
        }
    });

    checkAuthOnIndex();

    const header = document.getElementById('site-header');
    if (header) {
        const onScroll = () => {
            header.classList.toggle('scrolled', window.scrollY > 20);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    const menuToggle = document.getElementById('menu-toggle');
    const navLinks   = document.getElementById('nav-links');

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            const open = navLinks.classList.toggle('active');
            menuToggle.classList.toggle('active', open);
            menuToggle.setAttribute('aria-expanded', String(open));
            menuToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
            document.body.style.overflow = open ? 'hidden' : '';
        });

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                menuToggle.classList.remove('active');
                menuToggle.setAttribute('aria-expanded', 'false');
                menuToggle.setAttribute('aria-label', 'Открыть меню');
                document.body.style.overflow = '';
            });
        });

        document.addEventListener('click', e => {
            if (!menuToggle.contains(e.target) && !navLinks.contains(e.target)) {
                navLinks.classList.remove('active');
                menuToggle.classList.remove('active');
                menuToggle.setAttribute('aria-expanded', 'false');
                menuToggle.setAttribute('aria-label', t ? t('nav_open_menu') : 'Открыть меню');
                document.body.style.overflow = '';
            }
        });
    }

    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', e => {
            const target = document.querySelector(a.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    const gameQuestions = [
        {
            question_key: 'game_q1',
            answers: [
                { text_key: 'game_q1_a1', correct: false },
                { text_key: 'game_q1_a2', correct: true  },
                { text_key: 'game_q1_a3', correct: false },
            ]
        },
        {
            question_key: 'game_q2',
            answers: [
                { text_key: 'game_q2_a1', correct: false },
                { text_key: 'game_q2_a2', correct: true  },
                { text_key: 'game_q2_a3', correct: false },
            ]
        },
        {
            question_key: 'game_q3',
            answers: [
                { text_key: 'game_q3_a1', correct: false },
                { text_key: 'game_q3_a2', correct: true  },
                { text_key: 'game_q3_a3', correct: false },
            ]
        },
        {
            question_key: 'game_q4',
            answers: [
                { text_key: 'game_q4_a1', correct: false },
                { text_key: 'game_q4_a2', correct: true  },
                { text_key: 'game_q4_a3', correct: false },
            ]
        },
        {
            question_key: 'game_q5',
            answers: [
                { text_key: 'game_q5_a1', correct: false },
                { text_key: 'game_q5_a2', correct: true  },
                { text_key: 'game_q5_a3', correct: false },
            ]
        },
        {
            question_key: 'game_q6',
            answers: [
                { text_key: 'game_q6_a1', correct: false },
                { text_key: 'game_q6_a2', correct: false },
                { text_key: 'game_q6_a3', correct: true  },
            ]
        },
    ];
    let currentQuestionIndex = 0;

    const gameModal = document.getElementById('gameModal');
    const howItWorksBtn = document.getElementById('howItWorksBtn');
    const closeGameModal = document.getElementById('closeGameModal');
    const gameQuestion = document.getElementById('gameQuestion');
    const gameAnswers = document.getElementById('gameAnswers');
    const gameProgressText = document.getElementById('gameProgressText');
    const pinkVignette = document.getElementById('pinkVignette');

    function openGameModal() {
        currentQuestionIndex = 0;
        gameModal.classList.add('active');
        renderQuestion();
    }

    function closeGameModalHandler() {
        gameModal.classList.remove('active');
    }

    function renderQuestion() {
        if (currentQuestionIndex >= gameQuestions.length) {
            gameQuestion.textContent = t ? t('game_complete') : 'Отлично! Теперь ты знаешь весь процесс.';
            gameAnswers.innerHTML = `<a href="configurator.html" class="btn btn-primary" style="margin-top:1rem;">${t ? t('hero_btn_configure') : 'Настроить заказ'}</a>`;
            gameProgressText.textContent = '';
            return;
        }

        const question = gameQuestions[currentQuestionIndex];
        gameQuestion.textContent = t ? t(question.question_key) : question.question_key;

        gameAnswers.innerHTML = '';
        question.answers.forEach((answer) => {
            const btn = document.createElement('button');
            btn.className = 'game-answer-btn';
            btn.textContent = t ? t(answer.text_key) : answer.text_key;
            btn.addEventListener('click', () => handleAnswer(answer.correct, btn));
            gameAnswers.appendChild(btn);
        });

        const progressText = (t ? t('game_progress') : 'Вопрос {current} из {total}')
            .replace('{current}', currentQuestionIndex + 1)
            .replace('{total}', gameQuestions.length);
        gameProgressText.textContent = progressText;
    }

    function handleAnswer(isCorrect, btn) {
        const allBtns = gameAnswers.querySelectorAll('.game-answer-btn');
        allBtns.forEach(b => b.disabled = true);

        if (isCorrect) {
            btn.style.background = 'rgba(34, 197, 94, 0.15)';
            btn.style.borderColor = 'rgba(34, 197, 94, 0.5)';
            btn.style.color = 'rgba(34, 197, 94, 1)';
            showVignette();
            setTimeout(() => {
                currentQuestionIndex++;
                renderQuestion();
            }, 1200);
        } else {
            btn.style.background = 'rgba(255, 60, 60, 0.15)';
            btn.style.borderColor = 'rgba(255, 60, 60, 0.35)';
            setTimeout(() => {
                allBtns.forEach(b => {
                    b.disabled = false;
                    b.style.background = '';
                    b.style.borderColor = '';
                    b.style.color = '';
                });
            }, 900);
        }
    }

    function showVignette() {
        pinkVignette.classList.add('show');
        setTimeout(() => {
            pinkVignette.classList.remove('show');
        }, 3000);
    }

    if (howItWorksBtn) {
        howItWorksBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openGameModal();
        });
    }

    if (closeGameModal) {
        closeGameModal.addEventListener('click', closeGameModalHandler);
    }

    if (gameModal) {
        gameModal.addEventListener('click', (e) => {
            if (e.target === gameModal) {
                closeGameModalHandler();
            }
        });
    }
});