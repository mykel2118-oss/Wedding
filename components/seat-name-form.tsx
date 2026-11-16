export function SeatNameForm({ preset = "" }: { preset?: string }) {
  return (
    <form className="seat-lookup" action="/seats" method="get">
      <label>
        <span>Your name</span>
        <input
          type="text"
          name="name"
          defaultValue={preset}
          maxLength={60}
          required
          autoComplete="name"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Your full name"
        />
      </label>
      <p className="seat-card-note">One full name from your family is enough.</p>
      <button className="button" type="submit">
        See your seat
      </button>
    </form>
  );
}
