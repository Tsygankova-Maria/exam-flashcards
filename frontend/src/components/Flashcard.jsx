export default function Flashcard({ question, answer, flipped, onFlip }) {
  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onFlip();
    }
  };

  return (
    <div className="card-scene">
      <div
        className={`card${flipped ? ' is-flipped' : ''}`}
        onClick={onFlip}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={flipped ? 'Показать вопрос' : 'Показать ответ'}
      >
        <div className="card-face card-front">
          <span className="card-label">ВОПРОС</span>
          <p className="card-text">{question}</p>
        </div>
        <div className="card-face card-back">
          <span className="card-label">ОТВЕТ</span>
          <p className="card-text">{answer}</p>
        </div>
      </div>
    </div>
  );
}/*  */