import styles from './css.module.css';

const Component = () => {
  const res = { a: 1 }['unused-class-name'];
  const obj = {};
  obj['unused-class-name'];

  const name = styles.testClassName;
};
