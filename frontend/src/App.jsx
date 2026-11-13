import { useCallback, useEffect, useState } from 'react';
import Flashcard from './components/Flashcard.jsx';
import './App.css';

const SERVER_DOWN_MESSAGE =
  'Не удалось загрузить вопросы. Похоже, C++ сервер не запущен. ' +
  'Запустите его командой «cd backend && ./server» (порт 8080) ' +
  'и нажмите «Обновить вопросы».';

function shuffleArray(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function normalizeCards(data) {
  if (!Array.isArray(data)) {
    throw new Error('Файл data.json должен содержать JSON-массив.');
  }
  return data
    .filter(
      (item) =>
        item &&
        typeof item.question === 'string' &&
        typeof item.answer === 'string'
    )
    .map((item, i) => ({
      id: item.id ?? i + 1,
      question: item.question,
      answer: item.answer,
    }));
}

export default function App() {
  const [cards, setCards] = useState([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCards = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/cards', { cache: 'no-store' });
      if (!response.ok) {
        let details = '';
        try {
          const body = await response.json();
          if (body && body.error) details = body.error;
        } catch {
          // тело ответа не JSON (например, прокси не достучался до сервера)
        }
        throw new Error(details ? `Ошибка сервера: ${details}` : SERVER_DOWN_MESSAGE);
      }
      const data = await response.json();
      const loaded = normalizeCards(data);
      setCards(loaded);
      setIndex(0);
      setFlipped(false);
    } catch (err) {
      setCards([]);
      setIndex(0);
      setFlipped(false);
      if (err instanceof TypeError) {
        setError(SERVER_DOWN_MESSAGE);
      } else if (err instanceof SyntaxError) {
        setError('Файл data.json содержит некорректный JSON. Исправьте его и нажмите «Обновить вопросы».');
      } else {
        setError(err.message || SERVER_DOWN_MESSAGE);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const total = cards.length;
  const hasCards = total > 0;

  const goNext = useCallback(() => {
    if (total === 0) return;
    setIndex((prev) => Math.min(prev + 1, total - 1));
    setFlipped(false);
  }, [total]);

  const goPrev = useCallback(() => {
    if (total === 0) return;
    setIndex((prev) => Math.max(prev - 1, 0));
    setFlipped(false);
  }, [total]);

  const toggleFlip = useCallback(() => {
    if (total === 0) return;
    setFlipped((prev) => !prev);
  }, [total]);

  const handleShuffle = () => {
    setCards((prev) => shuffleArray(prev));
    setIndex(0);
    setFlipped(false);
  };

  // Горячие клавиши: ← → и Пробел
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
      } else if (event.key === ' ' || event.code === 'Space') {
        // Если фокус на кнопке (через Tab), пусть Пробел нажмёт её, как обычно.
        if (event.target instanceof HTMLElement && event.target.tagName === 'BUTTON') {
          return;
        }
        event.preventDefault();
        toggleFlip();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, toggleFlip]);

  // После клика мышью снимаем фокус с кнопки, чтобы Пробел переворачивал карточку,
  // а не повторно нажимал кнопку.
  const withBlur = (handler) => (event) => {
    event.currentTarget.blur();
    handler();
  };

  const currentCard = hasCards ? cards[index] : null;
  const progressPercent = hasCards ? ((index + 1) / total) * 100 : 0;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Карточки для экзамена</h1>
        <p className="subtitle">
          Нажмите на карточку или клавишу «Пробел», чтобы перевернуть. Стрелки ← → — переключение.
        </p>
      </header>

      <main className="app-main">
        {loading && <p className="status">Загрузка вопросов…</p>}

        {!loading && error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}

        {!loading && !error && !hasCards && (
          <p className="status">В файле data.json пока нет ни одного вопроса.</p>
        )}

        {!loading && currentCard && (
          <>
            <div className="progress-info">
              Вопрос {index + 1} из {total}
            </div>
            <div
              className="progress-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={index + 1}
            >
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>

            {/* key заставляет карточку пересоздаться: она сразу показывает вопрос */}
            <Flashcard
              key={`${index}-${currentCard.id}`}
              question={currentCard.question}
              answer={currentCard.answer}
              flipped={flipped}
              onFlip={toggleFlip}
            />

            <div className="controls">
              <button
                type="button"
                className="btn"
                onClick={withBlur(goPrev)}
                disabled={index === 0}
              >
                ← Назад
              </button>
              <button
                type="button"
                className="btn"
                onClick={withBlur(goNext)}
                disabled={index === total - 1}
              >
                Вперёд →
              </button>
            </div>
          </>
        )}
      </main>

      <footer className="toolbar">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={withBlur(handleShuffle)}
          disabled={!hasCards || loading}
        >
          Перемешать
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={withBlur(loadCards)}
          disabled={loading}
        >
          Обновить вопросы
        </button>
      </footer>
    </div>
  );
}