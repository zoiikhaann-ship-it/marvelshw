import { Fragment } from "react";
import { parseHomework, splitBold } from "../lib/text";
import type { TextDir } from "../lib/types";

export type DiaryRow = {
  id: string;
  subject: string;
  text: string;
  dir: TextDir;
  continued: boolean;
  blank: boolean;
};

export type PageMeta = {
  weekday: string;
  dateText: string;
  className: string;
  section: string;
  teacherName: string;
};

function Inline({ text }: { text: string }) {
  return (
    <>
      {splitBold(text).map((part, index) =>
        part.bold ? <strong key={index}>{part.text}</strong> : <Fragment key={index}>{part.text}</Fragment>,
      )}
    </>
  );
}

/**
 * Renders homework line by line. Each line gets its own direction (Urdu right-to-left,
 * English left-to-right) unless the teacher forced one for the whole field.
 */
export function HomeworkText({ text, dir }: { text: string; dir: TextDir }) {
  const lines = parseHomework(text);
  return (
    <div className="hw">
      {lines.map((line, index) => {
        if (line.kind === "gap") return <div className="hw-gap" key={index} />;
        const className = `hw-line ${line.urdu ? "hw-urdu" : "hw-latin"}`;
        const lang = line.urdu ? "ur" : "en";
        if (line.kind === "item") {
          return (
            <div key={index} className={`${className} hw-item`} dir={dir} lang={lang}>
              <span className="hw-marker">{line.marker}</span>
              <span className="hw-body">
                <Inline text={line.text} />
              </span>
            </div>
          );
        }
        return (
          <div key={index} className={className} dir={dir} lang={lang}>
            <Inline text={line.text} />
          </div>
        );
      })}
    </div>
  );
}

type Props = {
  meta: PageMeta;
  logo: string | null;
  rows: DiaryRow[];
  variant: "full" | "compact";
  pageNumber: number;
  pageCount: number;
  mode?: "page" | "measure-structure" | "measure-rows";
};

export function DiaryPage({ meta, logo, rows, variant, pageNumber, pageCount, mode = "page" }: Props) {
  const isPage = mode === "page";
  return (
    <article
      className={`diary-page diary-${variant}${mode === "measure-rows" ? " diary-page--auto" : ""}`}
      {...(isPage ? { "data-diary-page": "" } : {})}
    >
      <div className="diary-frame">
        <div className="diary-top">
          <header className="diary-brand">
            {logo ? (
              <img className="diary-logo" src={logo} alt="Marvels Montessori and School logo" />
            ) : (
              <div className="diary-logo-missing">School logo</div>
            )}
            <div className="diary-school">MARVELS MONTESSORI AND SCHOOL</div>
            <div className="diary-address">Sector B-17, Islamabad</div>
            <div className="diary-accent" />
          </header>

          <div className="diary-banner">
            <span>{meta.weekday}</span>
            <i>|</i>
            <span>Daily Homework</span>
            <i>|</i>
            <span>Date: {meta.dateText}</span>
          </div>

          <div className="diary-class">
            <span className="cls">Class: {meta.className}</span>
            {meta.section ? <span className="sec">Section {meta.section}</span> : null}
          </div>
        </div>

        <div className="diary-table-area">
          <table className="diary-table">
            <colgroup>
              <col style={{ width: 156 }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Subject</th>
                <th scope="col">Homework</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-row-id={row.id}>
                  <td className="diary-subject" dir="auto">
                    {row.subject}
                    {row.continued ? <span className="diary-cont">(continued)</span> : null}
                  </td>
                  <td className="diary-homework">
                    {row.blank ? <div className="hw-none">No homework</div> : <HomeworkText text={row.text} dir={row.dir} />}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && isPage ? (
                <tr>
                  <td colSpan={2} className="diary-empty">
                    Homework you type will appear here.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="diary-bottom">
          <div className="diary-sign-title">Signatures, For Parents &amp; Teachers</div>
          <div className="diary-sign-row">
            <div className="diary-sign">
              <span>Class Teacher:</span>
              <span className="line" dir="auto">
                {meta.teacherName}
              </span>
            </div>
            <div className="diary-sign">
              <span>Parents&apos; Signature:</span>
              <span className="line" />
            </div>
          </div>
          <div className="diary-pageno">{pageCount > 1 ? `Page ${pageNumber} of ${pageCount}` : "\u00A0"}</div>
        </div>
      </div>
    </article>
  );
}
