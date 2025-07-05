console.log('Testing module imports...');
try {
  const { HNSWLib } = require('@langchain/community/vectorstores/hnswlib');
  console.log('Successfully imported @langchain/community/vectorstores/hnswlib');
  
  const { OpenAIEmbeddings } = require('@langchain/openai');
  console.log('Successfully imported @langchain/openai');
  
  const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
  console.log('Successfully imported langchain/text_splitter');
  
  console.log('All required modules are available!');
} catch (error) {
  console.error('Error importing modules:', error);
}
