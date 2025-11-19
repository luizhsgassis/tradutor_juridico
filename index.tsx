
import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type, Chat } from "@google/genai";

type View = 'home' | 'result';
type Jurimetrics = {
    probabilityOfSuccess: number;
    estimatedDuration: string;
    positiveFactors: string[];
    negativeFactors: string[];
};
type TranslationResult = {
    id: string;
    timestamp: number;
    translation: string;
    summaryPoints: string[];
    originalText: string;
    jurimetrics: Jurimetrics;
};
type ChatMessage = {
    role: 'user' | 'model';
    text: string;
};

// --- Main App Component ---
const App = () => {
    // --- State Management ---
    const [view, setView] = useState<View>('home');
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<TranslationResult | null>(null);
    const [translationHistory, setTranslationHistory] = useState<TranslationResult[]>([]);
    
    // Chat specific state
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');

    // File upload state
    const [isUploadingFile, setIsUploadingFile] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const uploadIntervalRef = useRef<number | null>(null);


    const chatRef = useRef<Chat | null>(null);
    const chatWindowRef = useRef<HTMLDivElement>(null);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // --- Effects ---
    useEffect(() => {
        try {
            const storedHistory = localStorage.getItem('translationHistory');
            if (storedHistory) {
                setTranslationHistory(JSON.parse(storedHistory));
            }
        } catch (e) {
            console.error("Falha ao carregar o histórico de traduções:", e);
            localStorage.removeItem('translationHistory');
        }
    }, []);

    useEffect(() => {
        if (chatWindowRef.current) {
            chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
        }
    }, [chatHistory]);

    // --- Handlers ---
    const handleGoHome = () => {
        setView('home');
        setResult(null);
        setChatHistory([]);
        // Do not clear inputText so user can edit it
        setError('');
        setIsChatOpen(false);
        chatRef.current = null;
    };

    const handleTranslate = async () => {
        if (!inputText.trim()) {
            setError('Por favor, insira um texto para traduzir.');
            return;
        }
        setIsLoading(true);
        setError('');
        setResult(null);

        const model = 'gemini-2.5-flash';
        const prompt = `O seguinte texto é um trecho de um documento jurídico brasileiro. Analise-o e forneça: 1. Uma 'translation' (tradução) para português coloquial e simples, mantendo a formatação original. 2. 'summaryPoints' (pontos principais) em uma lista. 3. Uma 'jurimetrics' (análise jurimétrica) simulada, contendo: 'probabilityOfSuccess' (um número de 0 a 100), 'estimatedDuration' (uma string, ex: '6-12 meses'), 'positiveFactors' (lista de fatores positivos), e 'negativeFactors' (lista de fatores negativos).\n\nTexto: "${inputText}"`;

        try {
            const response = await ai.models.generateContent({
                model,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            translation: {
                                type: Type.STRING,
                                description: "A tradução do texto jurídico para português simples e coloquial."
                            },
                            summaryPoints: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                                description: "Uma lista de pontos principais do significado prático do texto."
                            },
                            jurimetrics: {
                                type: Type.OBJECT,
                                properties: {
                                    probabilityOfSuccess: { type: Type.NUMBER, description: "Probabilidade de sucesso de 0 a 100." },
                                    estimatedDuration: { type: Type.STRING, description: "Duração estimada do processo." },
                                    positiveFactors: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Fatores positivos." },
                                    negativeFactors: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Fatores negativos." },
                                },
                                required: ["probabilityOfSuccess", "estimatedDuration", "positiveFactors", "negativeFactors"]
                            }
                        },
                        required: ["translation", "summaryPoints", "jurimetrics"]
                    }
                }
            });
            const parsedResult = JSON.parse(response.text);
            const newResult: TranslationResult = {
                ...parsedResult,
                originalText: inputText,
                id: Date.now().toString(),
                timestamp: Date.now(),
            };
            setResult(newResult);
            
            setTranslationHistory(prev => {
                const updatedHistory = [newResult, ...prev].slice(0, 50); // Keep last 50
                localStorage.setItem('translationHistory', JSON.stringify(updatedHistory));
                return updatedHistory;
            });

            setView('result');
        } catch (e) {
            console.error(e);
            setError('Ocorreu um erro ao traduzir o texto. Tente novamente.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleStartChat = async () => {
        setIsChatOpen(true);
        
        if (chatRef.current && chatHistory.length > 0) {
            return;
        }

        setIsLoading(true);
        setChatHistory([]);
        
        try {
            chatRef.current = ai.chats.create({
                model: 'gemini-2.5-flash',
                config: {
                    systemInstruction: `Você é 'Lex', um assistente de IA especializado em direito processual brasileiro. Sua missão é ajudar cidadãos leigos a entenderem seus processos judiciais. Use um tom empático e claro. Baseie respostas em probabilidades e estimativas de tempo (simulando dados de jurimetria), sempre deixando claro que são estimativas. O contexto é o texto: '${result?.originalText}', traduzido como: '${result?.translation}'.`
                }
            });

            const firstPrompt = `Baseado no texto jurídico que analisei, inicie a conversa de forma proativa. Por exemplo, pergunte se quero saber os próximos passos ou as chances de um resultado favorável. Seja breve e amigável.`;
            const response = await chatRef.current.sendMessage({ message: firstPrompt });
            setChatHistory([{ role: 'model', text: response.text }]);
        } catch (e) {
            console.error(e);
            setChatHistory([{ role: 'model', text: 'Desculpe, não consegui iniciar o chat. Tente novamente.' }]);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleCloseChat = () => setIsChatOpen(false);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || isLoading || !chatRef.current) return;

        const userMessage: ChatMessage = { role: 'user', text: chatInput };
        setChatHistory(prev => [...prev, userMessage]);
        const currentChatInput = chatInput;
        setChatInput('');
        setIsLoading(true);

        try {
            const response = await chatRef.current.sendMessage({ message: currentChatInput });
            const modelMessage: ChatMessage = { role: 'model', text: response.text };
            setChatHistory(prev => [...prev, modelMessage]);
        } catch (e) {
            console.error(e);
            const errorMessage: ChatMessage = { role: 'model', text: 'Desculpe, não consegui processar sua pergunta. Tente novamente.' };
            setChatHistory(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
             setError('Por favor, selecione um arquivo PDF válido.');
             e.target.value = '';
             return;
        }
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
             setError('O arquivo excede o limite de 10MB.');
             e.target.value = '';
             return;
        }

        setSelectedFile(file);
        setIsUploadingFile(true);
        setUploadProgress(0);
        setError('');

        uploadIntervalRef.current = window.setInterval(() => {
            setUploadProgress(prev => {
                const newProgress = prev + Math.random() * 20;
                if (newProgress >= 100) {
                    if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
                    
                    setUploadProgress(100);
                    setTimeout(() => {
                        alert("O processamento de PDF ainda não foi implementado. Por favor, cole o texto na caixa.");
                        setIsUploadingFile(false);
                        setSelectedFile(null);
                        setUploadProgress(0);
                    }, 500);

                    return 100;
                }
                return newProgress;
            });
        }, 300);

        e.target.value = ''; // Reset input
    };
    
    const handleCancelUpload = () => {
        if (uploadIntervalRef.current) {
            clearInterval(uploadIntervalRef.current);
            uploadIntervalRef.current = null;
        }
        setIsUploadingFile(false);
        setUploadProgress(0);
        setSelectedFile(null);
    };


    const handleClearHistory = () => {
        setTranslationHistory([]);
        localStorage.removeItem('translationHistory');
    };

    const handleViewHistoryItem = (item: TranslationResult) => {
        setResult(item);
        // Reset chat state as it's context-specific
        setIsChatOpen(false);
        setChatHistory([]);
        chatRef.current = null;
        setView('result');
    };


    const renderView = () => {
        switch (view) {
            case 'result':
                return <ResultPage 
                           result={result!} 
                           onStartChat={handleStartChat} 
                           onGoHome={handleGoHome}
                           isChatOpen={isChatOpen}
                           onCloseChat={handleCloseChat}
                           chatHistory={chatHistory}
                           chatInput={chatInput}
                           onChatInputChange={setChatInput}
                           onSendMessage={handleSendMessage}
                           isLoading={isLoading}
                           chatWindowRef={chatWindowRef}
                        />;
            case 'home':
            default:
                return <HomePage 
                          inputText={inputText}
                          onInputChange={setInputText}
                          onTranslate={handleTranslate}
                          onFileChange={handleFileChange}
                          isLoading={isLoading}
                          error={error}
                          translationHistory={translationHistory}
                          onClearHistory={handleClearHistory}
                          onViewHistoryItem={handleViewHistoryItem}
                          isUploadingFile={isUploadingFile}
                          uploadProgress={uploadProgress}
                          selectedFile={selectedFile}
                          onCancelUpload={handleCancelUpload}
                       />;
        }
    };
    return <div className="relative flex min-h-screen w-full flex-col">{renderView()}</div>;
};

// --- Child Components ---

const HomePage = ({ inputText, onInputChange, onTranslate, onFileChange, isLoading, error, translationHistory, onClearHistory, onViewHistoryItem, isUploadingFile, uploadProgress, selectedFile, onCancelUpload }) => (
    <>
        <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-b-[#f0f2f4] px-4 sm:px-8 md:px-16 lg:px-24 xl:px-40 py-4">
            <a href="#" onClick={(e) => { e.preventDefault(); }} className="flex items-center gap-3 cursor-default">
                <div className="text-primary"><svg className="lucide lucide-scale" fill="none" height="32" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="32" xmlns="http://www.w3.org/2000/svg"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="M7 21h10"></path><path d="M12 3v18"></path><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path></svg></div>
                <h2 className="text-text-light text-xl font-bold leading-tight tracking-[-0.015em]">Tradutor Jurídico</h2>
            </a>
        </header>
        <main className="flex flex-1 justify-center py-10 sm:py-16 md:py-20">
            <div className="layout-content-container flex flex-col max-w-4xl flex-1 px-4">
                <div className="flex flex-col items-center text-center gap-4 mb-10">
                    <h1 className="text-text-light text-4xl sm:text-5xl font-black leading-tight tracking-[-0.033em]">Simplificando a Linguagem da Justiça</h1>
                    <p className="text-text-light/80 text-lg font-normal leading-normal max-w-2xl">Cole o texto do seu processo ou documento jurídico abaixo para receber uma tradução clara e compreensível.</p>
                </div>
                <div className="w-full flex flex-col gap-6">
                    <textarea 
                        className="form-input flex w-full min-w-0 flex-1 resize-y overflow-y-auto rounded-xl text-text-light focus:outline-0 focus:ring-2 focus:ring-primary/50 border border-[#dbe0e6] bg-white focus:border-primary min-h-60 placeholder:text-text-light/50 p-6 text-base font-normal leading-normal" 
                        placeholder="Ex: 'Vistos. Diante do exposto, indefiro o pedido liminar...'"
                        value={inputText}
                        onChange={(e) => onInputChange(e.target.value)}
                        disabled={isLoading || isUploadingFile}
                    />
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        {isUploadingFile ? (
                            <div className="flex w-full sm:w-auto sm:min-w-[300px] max-w-[480px] items-center justify-center rounded-lg h-auto px-4 py-3 bg-white border border-gray-300 text-text-light gap-3">
                                <span className="material-symbols-outlined text-primary animate-spin">progress_activity</span>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center text-sm font-medium">
                                        <p className="truncate max-w-[160px] sm:max-w-[220px]">{selectedFile?.name}</p>
                                        <p className="text-gray-500">{`${Math.round(uploadProgress)}%`}</p>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                                        <div className="bg-primary h-1.5 rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }}></div>
                                    </div>
                                </div>
                                <button onClick={onCancelUpload} className="p-1 rounded-full hover:bg-gray-200" aria-label="Cancelar upload">
                                    <span className="material-symbols-outlined !text-xl flex items-center justify-center">close</span>
                                </button>
                            </div>
                        ) : (
                             <label htmlFor="file-upload" className="flex w-full sm:w-auto min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-[#f0f2f4] text-text-light gap-2 text-base font-bold leading-normal tracking-[0.015em] hover:bg-gray-200 transition-colors">
                                <span className="material-symbols-outlined text-text-light">attach_file</span>
                                <span className="truncate">Selecionar arquivo PDF</span>
                            </label>
                        )}
                        <input id="file-upload" type="file" className="hidden" onChange={onFileChange} disabled={isLoading || isUploadingFile} accept=".pdf" />
                        <p className="text-text-light/60">ou</p>
                        <button onClick={onTranslate} disabled={isLoading || !inputText || isUploadingFile} className="flex w-full sm:w-auto min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-primary text-white text-base font-bold leading-normal tracking-[0.015em] hover:bg-primary/90 transition-colors disabled:bg-primary/50 disabled:cursor-not-allowed">
                            {isLoading ? <div className="spinner !w-6 !h-6 !border-white/50 !border-t-white"></div> : <span className="truncate">Explicar Juridiquês</span>}
                        </button>
                    </div>
                    {error && <p className="text-center text-red-500 mt-4">{error}</p>}
                </div>

                {translationHistory.length > 0 && (
                    <div className="w-full mt-16">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-2xl font-bold text-text-light">Seu Histórico</h3>
                            <button
                                onClick={onClearHistory}
                                className="text-sm text-gray-500 hover:text-red-500 transition-colors flex items-center gap-1"
                                aria-label="Limpar histórico de traduções"
                            >
                                <span className="material-symbols-outlined !text-base">delete</span>
                                Limpar Histórico
                            </button>
                        </div>
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 bg-white/50 p-4 rounded-lg border border-gray-200">
                            {translationHistory.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => onViewHistoryItem(item)}
                                    className="w-full text-left p-4 bg-white border border-gray-200 rounded-lg cursor-pointer hover:shadow-md hover:border-primary transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    aria-label={`Ver tradução de ${new Date(item.timestamp).toLocaleString('pt-BR')}`}
                                >
                                    <p className="text-text-light font-medium truncate">{item.originalText}</p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        {new Date(item.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                
                <div className="mt-16 flex flex-col items-center gap-4 text-center">
                    <div className="flex items-center gap-3 text-text-light/80">
                        <span className="material-symbols-outlined text-secondary">verified_user</span>
                        <p className="text-sm font-medium">Seus dados são privados e seguros.</p>
                    </div>
                </div>
            </div>
        </main>
        <footer className="w-full border-t border-solid border-b-[#f0f2f4] mt-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row justify-between items-center text-sm text-text-light/60">
                <p>© 2024 Tradutor Jurídico. Todos os direitos reservados.</p>
                <div className="flex gap-4 mt-4 sm:mt-0">
                    <a className="hover:text-primary transition-colors" href="#">Termos de Serviço</a>
                    <a className="hover:text-primary transition-colors" href="#">Política de Privacidade</a>
                </div>
            </div>
        </footer>
    </>
);

const JurimetricsAnalysis = ({ jurimetrics }: { jurimetrics: Jurimetrics }) => {
    const { probabilityOfSuccess, estimatedDuration, positiveFactors, negativeFactors } = jurimetrics;
    const rotation = (probabilityOfSuccess / 100) * 180 - 90;

    const getGaugeColor = (value) => {
        if (value < 33) return 'text-red-500';
        if (value < 66) return 'text-yellow-500';
        return 'text-green-500';
    };

    return (
        <div className="bg-background-light p-6 rounded-lg mb-8 border border-gray-200">
            <h2 className="text-2xl font-bold leading-tight tracking-[-0.015em] mb-2 text-text-light">Análise Jurimétrica</h2>
            <p className="text-sm text-gray-500 mb-6">Aviso: Estas são estimativas geradas por IA e não substituem o aconselhamento de um advogado profissional.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Gauge Chart */}
                <div className="flex flex-col items-center justify-center p-4 bg-white rounded-lg border border-gray-200 text-center col-span-1 md:col-span-1">
                    <h3 className="text-lg font-bold text-text-light mb-2">Probabilidade de Sucesso</h3>
                    <div className="relative w-48 h-24 overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-full border-t-8 border-r-8 border-b-8 border-l-8 border-gray-200 rounded-t-full" style={{borderBottom: 'none'}}></div>
                        {/* Fix: Removed duplicate `clipPath` property which caused a syntax error. */}
                        <div 
                            className={`absolute top-0 left-0 w-full h-full border-t-8 border-r-8 border-b-8 border-l-8 ${getGaugeColor(probabilityOfSuccess)} rounded-t-full transition-all duration-500`} 
                            style={{
                                transform: `rotate(${(probabilityOfSuccess / 100) * 180}deg)`,
                                transformOrigin: 'bottom center',
                                borderBottom: 'none',
                                clipPath: 'inset(0 50% 0 0)'
                            }}
                        ></div>
                         <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-20 bg-gray-600 rounded-t-full" style={{ transform: `translateX(-50%) rotate(${rotation}deg)`, transformOrigin: 'bottom center', transition: 'transform 0.5s ease-out' }}></div>
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-white w-24 h-12 rounded-t-full"></div>
                    </div>
                    <p className={`relative z-10 text-4xl font-black ${getGaugeColor(probabilityOfSuccess)} -mt-6`}>{probabilityOfSuccess}%</p>
                </div>

                {/* Duration & Factors */}
                <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="p-4 bg-white rounded-lg border border-gray-200 flex flex-col justify-center items-center text-center">
                        <span className="material-symbols-outlined text-primary text-4xl mb-2">hourglass_top</span>
                        <h3 className="text-lg font-bold text-text-light mb-1">Estimativa de Duração</h3>
                        <p className="text-2xl font-bold text-primary">{estimatedDuration}</p>
                    </div>
                     <div className="p-4 bg-white rounded-lg border border-gray-200">
                        <h3 className="text-lg font-bold text-text-light mb-2">Fatores Chave</h3>
                        <div className="space-y-3">
                            {positiveFactors.map((factor, i) => (
                                <div key={`pos-${i}`} className="flex items-start gap-2 text-sm">
                                    <span className="material-symbols-outlined text-green-500 !text-base mt-0.5">check_circle</span>
                                    <p className="text-gray-700">{factor}</p>
                                </div>
                            ))}
                            {negativeFactors.map((factor, i) => (
                                <div key={`neg-${i}`} className="flex items-start gap-2 text-sm">
                                    <span className="material-symbols-outlined text-red-500 !text-base mt-0.5">cancel</span>
                                    <p className="text-gray-700">{factor}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ResultPage = ({ result, onStartChat, onGoHome, isChatOpen, onCloseChat, chatHistory, chatInput, onChatInputChange, onSendMessage, isLoading, chatWindowRef }) => (
    <>
     <div className="px-4 md:px-10 lg:px-20 xl:px-40 flex flex-1 justify-center py-5">
        <div className="layout-content-container flex flex-col max-w-[1200px] flex-1">
            <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-gray-200 px-6 py-3 bg-white rounded-t-lg">
                <a href="#" onClick={(e) => { e.preventDefault(); onGoHome(); }} className="flex items-center gap-3 text-left transition-opacity hover:opacity-80">
                    <div className="text-primary"><svg className="lucide lucide-scale" fill="none" height="32" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="32" xmlns="http://www.w3.org/2000/svg"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="M7 21h10"></path><path d="M12 3v18"></path><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path></svg></div>
                    <h2 className="text-text-light text-xl font-bold leading-tight tracking-[-0.015em]">Tradutor Jurídico</h2>
                </a>
            </header>
            <main className="flex-1 p-4 md:p-6 lg:p-8 bg-white rounded-b-lg">
                <div className="flex flex-wrap justify-between gap-4 mb-8">
                    <div className="flex min-w-72 flex-col gap-3"><p className="text-4xl font-black leading-tight tracking-[-0.033em]">Tradução e Resumo do seu Documento</p><p className="text-base font-normal leading-normal text-gray-500">Compare o texto original com a tradução lado a lado.</p></div>
                    <div className="flex items-center gap-2"><button className="p-2 rounded-full hover:bg-gray-100"><span className="material-symbols-outlined">content_copy</span></button><button className="p-2 rounded-full hover:bg-gray-100"><span className="material-symbols-outlined">print</span></button><button className="p-2 rounded-full hover:bg-gray-100"><span className="material-symbols-outlined">save</span></button></div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    <div className="flex flex-col gap-4"><h2 className="text-2xl font-bold leading-tight tracking-[-0.015em]">Texto Original</h2><div className="p-4 border rounded-lg bg-background-light h-96 overflow-y-auto text-sm text-text-light whitespace-pre-wrap"><p>{result.originalText}</p></div></div>
                    <div className="flex flex-col gap-4"><h2 className="text-2xl font-bold leading-tight tracking-[-0.015em]">Tradução Simplificada para Você</h2><div className="p-4 border rounded-lg bg-background-light h-96 overflow-y-auto text-sm text-text-light whitespace-pre-wrap"><p>{result.translation}</p></div></div>
                </div>
                
                {result.jurimetrics && <JurimetricsAnalysis jurimetrics={result.jurimetrics} />}
                
                <div className="bg-primary/10 p-6 rounded-lg mb-8">
                    <h2 className="text-2xl font-bold leading-tight tracking-[-0.015em] mb-4 text-text-light">Pontos Principais</h2>
                    <ul className="list-disc list-inside space-y-2 text-base text-gray-700">{result.summaryPoints.map((point, i) => <li key={i}>{point}</li>)}</ul>
                </div>
            </main>
        </div>
    </div>
    
    {/* CHAT BUTTON & WIDGET */}
    {!isChatOpen && (
        <button 
            onClick={onStartChat} 
            className="fixed bottom-8 right-8 z-40 flex items-center justify-center gap-3 cursor-pointer rounded-xl h-14 px-8 bg-accent text-white text-lg font-bold leading-normal tracking-[0.015em] hover:bg-accent/90 transition-colors shadow-lg animate-slide-in"
            aria-label="O Que Vem a Seguir? Converse com nosso assistente"
        >
            <span className="truncate">O Que Vem a Seguir? Converse com nosso assistente</span>
            <span className="material-symbols-outlined">chat</span>
        </button>
    )}
    {isChatOpen && <ChatWidget 
        onClose={onCloseChat} 
        chatHistory={chatHistory}
        chatInput={chatInput}
        onChatInputChange={onChatInputChange}
        onSendMessage={onSendMessage}
        isLoading={isLoading}
        chatWindowRef={chatWindowRef}
    />}
    </>
);

const parseBoldMarkdown = (text: string): React.ReactNode => {
    if (!text) return null;
    const parts = text.split('**');
    return parts.map((part, index) => {
        if (index % 2 === 1) {
            return <strong key={index}>{part}</strong>;
        }
        return part;
    });
};

const ChatWidget = ({ chatHistory: history, chatInput, onChatInputChange, onSendMessage, isLoading, chatWindowRef, onClose }) => (
    <div className="fixed bottom-8 right-8 w-[400px] max-h-[600px] bg-white rounded-xl shadow-2xl flex flex-col z-50 transition-transform transform-gpu animate-slide-in">
        <header className="flex items-center justify-between p-4 bg-primary text-white rounded-t-xl shrink-0">
            <div className="flex items-center gap-3">
                <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full w-8 h-8 shrink-0 border-2 border-white" style={{backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuAeEXEntBnfXSzVIvpRmN-DZ01BfGBXo4GV0OCOFIcib-Cit3d-KTF6NUFlgAkucVdNbUThrwZYKNfVm3dry8Om3R8kTGnX34YXAJORoblvnF63aJTJcNtf1WI2zmRk4L39fBM9QN3Vn359OvXDSL9LzUVGr1Uk_niWt4zhGyFQyTecln4MPyCvFZRHfoyGpSSd5aZXEpgawRCjB0uOSUIi2-WrNJvMImDb_jrVJCsPmitWoykQVNc9bwUENGAY8-XnTPwzDGIfdzY")'}}></div>
                <h3 className="text-lg font-bold">Converse com Lex</h3>
            </div>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20 transition-colors">
                <span className="material-symbols-outlined !text-2xl flex items-center justify-center">close</span>
            </button>
        </header>

        <div ref={chatWindowRef} className="flex-grow p-4 overflow-y-auto space-y-4">
            {isLoading && history.length === 0 ? (
                 <div className="flex justify-center items-center h-full">
                    <div className="spinner"></div>
                 </div>
            ) : (
                <>
                {history.map((msg, index) => (
                    msg.role === 'model' ? (
                        <div key={index} className="flex items-end gap-3">
                            <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full w-8 h-8 shrink-0 border-2 border-white shadow-sm" style={{backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuAeEXEntBnfXSzVIvpRmN-DZ01BfGBXo4GV0OCOFIcib-Cit3d-KTF6NUFlgAkucVdNbUThrwZYKNfVm3dry8Om3R8kTGnX34YXAJORoblvnF63aJTJcNtf1WI2zmRk4L39fBM9QN3Vn359OvXDSL9LzUVGr1Uk_niWt4zhGyFQyTecln4MPyCvFZRHfoyGpSSd5aZXEpgawRCjB0uOSUIi2-WrNJvMImDb_jrVJCsPmitWoykQVNc9bwUENGAY8-XnTPwzDGIfdzY")'}}></div>
                            <div className="flex flex-col gap-1 items-start">
                                <p className="text-gray-500 text-[12px] font-medium leading-normal">Lex</p>
                                <div className="text-base font-normal leading-relaxed max-w-xs rounded-lg rounded-tl-none px-3 py-2 bg-gray-100 text-gray-800 whitespace-pre-wrap">{parseBoldMarkdown(msg.text)}</div>
                            </div>
                        </div>
                    ) : (
                        <div key={index} className="flex items-end gap-3 justify-end">
                            <div className="flex flex-col gap-1 items-end">
                                <p className="text-gray-500 text-[12px] font-medium leading-normal text-right">Você</p>
                                <div className="text-base font-normal leading-relaxed flex max-w-xs rounded-lg rounded-tr-none px-3 py-2 bg-primary text-white">{msg.text}</div>
                            </div>
                        </div>
                    )
                ))}
                {isLoading && history.length > 0 && (
                     <div className="flex items-end gap-3">
                        <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full w-8 h-8 shrink-0 border-2 border-white shadow-sm" style={{backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuAeEXEntBnfXSzVIvpRmN-DZ01BfGBXo4GV0OCOFIcib-Cit3d-KTF6NUFlgAkucVdNbUThrwZYKNfVm3dry8Om3R8kTGnX34YXAJORoblvnF63aJTJcNtf1WI2zmRk4L39fBM9QN3Vn359OvXDSL9LzUVGr1Uk_niWt4zhGyFQyTecln4MPyCvFZRHfoyGpSSd5aZXEpgawRCjB0uOSUIi2-WrNJvMImDb_jrVJCsPmitWoykQVNc9bwUENGAY8-XnTPwzDGIfdzY")'}}></div>
                        <div className="flex flex-col gap-1 items-start">
                            <p className="text-gray-500 text-[12px] font-medium leading-normal">Lex</p>
                            <div className="text-base font-normal leading-relaxed flex max-w-md rounded-lg rounded-tl-none px-4 py-3 bg-gray-100 text-gray-800">
                                <div className="spinner !w-5 !h-5 !border-gray-300 !border-t-primary"></div>
                            </div>
                        </div>
                    </div>
                )}
                </>
            )}
        </div>

        <div className="border-t border-gray-200 p-4 bg-white/50 rounded-b-xl shrink-0">
            <form className="flex items-center gap-3" onSubmit={onSendMessage}>
                <input 
                    className="flex-1 bg-gray-100 border-transparent focus:border-primary focus:ring-1 focus:ring-primary rounded-full h-11 px-4 text-sm text-gray-800 placeholder-gray-500" 
                    placeholder="Digite sua mensagem..." 
                    type="text"
                    value={chatInput}
                    onChange={(e) => onChatInputChange(e.target.value)}
                    disabled={isLoading}
                />
                <button type="submit" disabled={isLoading || !chatInput} className="flex items-center justify-center size-11 rounded-full bg-primary text-white hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:bg-primary/50 disabled:cursor-not-allowed">
                    <span className="material-symbols-outlined">send</span>
                </button>
            </form>
        </div>
    </div>
);


// --- Mount App ---
const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);