import './css.css';

const Component = () => {
  const name1 = `test-class-name`;
  const name2 = `foo test-class-name`;
  const name3 = `${name1} foo test-class-name-2 bar`;
  const name4 = `test-class-name bar ${name2}`;
  const name5 = `foo bar test-class-name ${name1} test-class-name-2 bar foo`;
  const name6 = `${Math.random() * Math.PI} test-class-name`;
};
