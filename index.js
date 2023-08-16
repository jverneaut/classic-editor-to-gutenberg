const mysql = require('mysql');

const CLASSIC_DB_NAME = 'CHANGE_ME';
const GUTENBERG_DB_NAME = 'CHANGE_ME';

const POST_TYPE = 'post';

const getConnection = (dbName) => {
  return mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'root',
    database: dbName,
  });
};

const classicEditorDB = getConnection(CLASSIC_DB_NAME);
const gutenbergDB = getConnection(GUTENBERG_DB_NAME);

(async () => {
  // Wait for connections
  await Promise.all([classicEditorDB, gutenbergDB]);

  // Get raw classic editor articles
  const classicEditorArticles = await new Promise((resolve) => {
    classicEditorDB.query(
      `SELECT * FROM wp_posts WHERE post_type = '${POST_TYPE}'`,
      (err, res) => resolve(res)
    );
  });

  // Get raw gutenberg articles
  const gutenbergArticles = await new Promise((resolve) => {
    gutenbergDB.query(
      `SELECT * FROM wp_posts WHERE post_type = '${POST_TYPE}'`,
      (err, res) => resolve(res)
    );
  });

  // Transform class editor articles to Gutenberg
  classicEditorArticles
    .filter(
      (classicEditorArticle) => classicEditorArticle.post_status === 'publish'
    )
    .forEach(async (classicEditorArticle) => {
      // Match gutenberg and class editor articles by title
      const foundGutenbergArticles = gutenbergArticles.filter(
        (gutenbergArticle) => {
          const charsToRemove = [
            '«',
            '»',
            '"',
            '</br>',
            'coûts RH',
            'coûts',
            'HR',
            'HR costs',
            '-',
            '–',
          ];

          // Clean-up titles
          const gutenbergTitle = charsToRemove.reduce(
            (acc, curr) => acc.replace(curr, ''),
            gutenbergArticle.post_title.trim()
          );

          const classicEditorTitle = charsToRemove.reduce(
            (acc, curr) => acc.replace(curr, ''),
            classicEditorArticle.post_title.trim()
          );

          // Loosely match articles by title
          return (
            gutenbergTitle.indexOf(classicEditorTitle) > -1 ||
            classicEditorTitle.indexOf(gutenbergTitle) > -1
          );
        }
      );

      if (!foundGutenbergArticles.length) {
        console.log(
          `"${classicEditorArticle.post_title}" ${POST_TYPE} not found`
        );
      }

      // Convert class editor articles to Gutenberg
      foundGutenbergArticles.forEach(async (gutenbergArticle) => {
        const blocks = ['acf/container', 'html'];

        const postContent = [
          ...blocks.map((block) => `<!-- wp:${block} -->`),
          classicEditorArticle.post_content,
          ...blocks.reverse().map((block) => `<!-- /wp:${block} -->`),
        ].join('');

        return await new Promise((resolve) => {
          gutenbergDB.query(
            `UPDATE wp_posts SET post_content=?, post_excerpt=?, post_content_filtered=? WHERE ID=?`,
            [
              postContent,
              classicEditorArticle.post_excerpt,
              classicEditorArticle.post_content_filtered,
              gutenbergArticle.ID,
            ],
            (err, res) => {
              resolve(res);
            }
          );
        });
      });
    });

  console.log('Conversion done');
})();
