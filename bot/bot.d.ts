interface Token {
  readonly symbol: string;
  readonly address: string;
}

interface Tokens {
  readonly [key: string]: Token;
}

interface TokenPair {
  symbols: string;
  fee:any;
  pairs: string[];
  
}

interface ArbitragePair {
  symbols: string;
  fee:any;
  pairs: [string, string];
}

interface AmmFactories {
  readonly [propName: string]: string;
}

interface Fees{
  readonly [key: string]: Factory;
}

interface Factory{
  readonly [key: string]: Fee;
}

interface Fee{
  readonly fee:any;
}


