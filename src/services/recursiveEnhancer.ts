import OpenAI from 'openai';

export interface DocumentContent {
  title: string;
  content: string;
  url?: string;
  hierarchy?: string[];
}

export class RecursiveEnhancer {
  private fineTunedModel: string;
  private maxDepth: number;
  private openai: OpenAI;
  
  constructor() {
    this.fineTunedModel = process.env.FINE_TUNED_MODEL_ID || '';
    this.maxDepth = parseInt(process.env.MAX_RECURSION_DEPTH || '2');
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  
  async enhanceContext(
    query: string,
    initialDocs: DocumentContent[],
    depth: number = 0
  ): Promise<DocumentContent[]> {
    // Skip if no fine-tuned model or max depth reached
    if (!this.fineTunedModel || depth >= this.maxDepth) {
      return initialDocs;
    }
    
    try {
      console.log(`🔍 Recursive enhancement depth ${depth} for query: "${query}"`);
      
      // Ask fine-tuned model for related topics
      const relatedTopics = await this.getRelatedTopics(query, initialDocs);
      
      if (relatedTopics.length === 0) {
        console.log('No related topics found, returning initial docs');
        return initialDocs;
      }
      
      console.log(`Found ${relatedTopics.length} related topics:`, relatedTopics);
      
      // Search for additional documents
      const additionalDocs = await this.searchRelatedDocs(relatedTopics);
      
      // Recursively enhance if needed
      if (depth < this.maxDepth - 1 && additionalDocs.length > 0) {
        const enhancedDocs = await this.enhanceContext(
          query,
          additionalDocs,
          depth + 1
        );
        // Use enhancedDocs directly as it already contains additionalDocs
        return this.mergeDocuments(initialDocs, enhancedDocs);
      }
      
      // Merge and deduplicate
      return this.mergeDocuments(initialDocs, additionalDocs);
    } catch (error) {
      console.log('Recursive enhancement failed, using initial docs:', error);
      return initialDocs;
    }
  }
  
  private async getRelatedTopics(
    query: string,
    docs: DocumentContent[]
  ): Promise<string[]> {
    const prompt = `Based on the user query "${query}" and the following documentation excerpts,
identify 2-3 related topics, concepts, or sections that would provide helpful additional context.

Current documentation:
${docs.map(d => `- ${d.title}: ${d.content.substring(0, 200)}...`).join('\n')}

Return ONLY a JSON array of search terms for finding related documentation.
Example: ["authentication", "JWT tokens", "session management"]`;
    
    const response = await this.openai.chat.completions.create({
      model: this.fineTunedModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
      temperature: 0.3
    });
    
    try {
      const content = response.choices[0]?.message?.content || '[]';
      return JSON.parse(content);
    } catch {
      return [];
    }
  }
  
  private async searchRelatedDocs(topics: string[]): Promise<DocumentContent[]> {
    // In a real implementation, this would search Algolia or other sources
    // For now, we'll simulate finding related documents
    const additionalDocs: DocumentContent[] = [];
    
    // This is a placeholder - in practice, you'd search your documentation
    // using the same search mechanism as the main search
    for (const topic of topics) {
      // Simulate searching for related documents
      console.log(`Searching for additional docs on topic: ${topic}`);
      
      // In practice, this would be:
      // const docs = await searchAlgolia(topic);
      // additionalDocs.push(...docs);
    }
    
    return additionalDocs;
  }
  
  private mergeDocuments(
    initialDocs: DocumentContent[],
    additionalDocs: DocumentContent[]
  ): DocumentContent[] {
    // Deduplicate by URL and title
    const seen = new Set<string>();
    const merged: DocumentContent[] = [];
    
    // Add initial docs first
    for (const doc of initialDocs) {
      const key = doc.url || doc.title;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(doc);
      }
    }
    
    // Add additional docs if not already present
    for (const doc of additionalDocs) {
      const key = doc.url || doc.title;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(doc);
      }
    }
    
    console.log(`Merged ${merged.length} documents (${initialDocs.length} initial + ${merged.length - initialDocs.length} new)`);
    return merged;
  }
  
  isEnabled(): boolean {
    return !!this.fineTunedModel && process.env.ENABLE_RECURSIVE_SEARCH === 'true';
  }
} 